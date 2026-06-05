// analyst.js  (repo root — the entrypoint GitHub Actions runs)
import { loadMemberData, readFamilyFile } from './src/sources.js';
import { computeBaseline } from './src/baseline.js';
import { applyPerturbations, applyStaleData, validateScenario } from './src/scenarios.js';
import { generateScenarioPool, pickScenario } from './src/scenarioGenerator.js';
import { runAnalyst, validateReport } from './src/analyst.js';
import { formatReport, sendTelegram, getTelegramConfig } from './src/telegram.js';
import { writeStore, readStore } from './src/store.js';
import { makeClient, getConfig } from './src/llm.js';
import { updateHistoryIndex } from './src/history.js';
import { pathToFileURL } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';

// Deterministic FNV-1a hash of the UTC calendar date (YYYY-MM-DD) — same date ⇒ same value,
// independent of time-of-day. Drives both the cadence gate and the daily seed/target rotation.
function hashDate(date) {
  const s = date.toISOString().slice(0, 10);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Quiet-by-default cadence gate. ~13% of days fire (lands in the tested 8–18% band over a year),
// deterministic per UTC date. force:true (workflow_dispatch) always fires. This is what keeps the
// family feed calm so a flag still means something.
export function shouldFireScenario(date, { force = false } = {}) {
  if (force) return true;
  return hashDate(date) % 1000 < 130;
}

// Classify a scenario label into the family the eval scores against.
export function scenarioFamily(label) {
  if (label === 'all_normal') return 'all_normal';
  if (label === 'stale_data') return 'stale_data';
  return 'perturbation';
}

// Scenario-family-aware scoring. `evaluable` (optional) restricts scoring to that name set
// (used to exclude real members, which have no ground truth). Omitted ⇒ score all members.
export function evalReport(report, { scenario_family, target_member, evaluable }) {
  const expected = scenario_family === 'stale_data' ? 'no_data'
                 : scenario_family === 'perturbation' ? 'worth_noting'
                 : null;
  const names = evaluable ? new Set(evaluable) : null;
  const consider = report.members.filter((m) => !names || names.has(m.name));
  const byName = new Map(consider.map((m) => [m.name, m.status]));
  const detected = target_member != null ? byName.get(target_member) === expected : null;
  const false_positives = consider
    .filter((m) => m.name !== target_member && m.status === 'worth_noting')
    .map((m) => m.name);
  return { detected, false_positives };
}

// Pure, fully-injectable pipeline. Returns the store object it wrote.
export async function run(deps) {
  const {
    today, env = {}, scenario = 'auto', force = false, llmClient,
    family = readFamilyFile(),
    scenarioPool = (client) => generateScenarioPool(client),
    readFeed, sendMessage, write = writeStore, storePath = 'data.json',
  } = deps;

  const dateHash = hashDate(today);
  const seed = dateHash % 100000;

  // 1. Build every member from config (synthetic → generator; feed → later task).
  const members = [];
  for (let i = 0; i < family.members.length; i++) {
    members.push(await loadMemberData(family.members[i], { today, days: 30, seed: seed + i * 1000, readFeed }));
  }

  // 2. Clean baselines for everyone, BEFORE any scenario mutates data.
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));

  // 3. Resolve effective scenario (gate unchanged).
  let gate_fired = false;
  let effective = scenario;
  if (scenario === 'auto') { gate_fired = shouldFireScenario(today, { force }); effective = gate_fired ? 'llm' : 'all_normal'; }

  // 4. Scenario targets a SYNTHETIC member only.
  const synthetic = members.filter((m) => !m.real);
  let label = 'all_normal', targetId = null, scenario_pool_size = 0, scenario_pool_valid = 0;
  const targetIdx = synthetic.length ? (dateHash % synthetic.length) : -1;
  const target = targetIdx >= 0 ? synthetic[targetIdx] : null;
  if (effective === 'stale_data' && target) {
    applyStaleData(target, 2); label = 'stale_data'; targetId = target.id;
  } else if (effective === 'llm' && target) {
    const pool = await scenarioPool(llmClient);
    scenario_pool_size = pool.length;
    scenario_pool_valid = pool.filter((s) => validateScenario(s).ok).length;
    const chosen = pickScenario(pool, seed);
    if (chosen) { applyPerturbations(target, chosen.perturbations); label = chosen.label; targetId = target.id; }
    else { label = 'all_normal'; console.warn('scenario pool empty — all_normal'); }
  }
  const targetName = targetId ? target.name : null;

  // 5. Analyst sees only members WITH data today; real no-data members are excluded.
  const prompted = members.filter((m) => m.today != null);
  const t0 = Date.now();
  let report = null;
  try { report = await runAnalyst(llmClient, prompted, baselines); }
  catch (e) { console.error('analyst failed:', e.message); }
  const llm_ms = Date.now() - t0;
  const model = llmClient?.model || env.GEMINI_MODEL || 'gemini-flash';

  // 6. Validate against the PROMPTED member count.
  const report_valid = report ? validateReport(report, prompted).ok : false;
  const messageText = report_valid ? formatReport(report, { simulated: members.some((m) => !m.real) }) : 'Daily Health Report unavailable today (technical issue) — data is synthetic, no action needed.';

  // 7. Eval over SYNTHETIC members only.
  const fam = scenarioFamily(label);
  const scenario_applied = label !== 'all_normal';
  const evaluable = synthetic.map((m) => m.name);
  let evalResult = { scenario_applied, scenario_family: fam, target_member: targetName, detected: null, false_positives: [] };
  if (report_valid) {
    const r = evalReport(report, { scenario_family: fam, target_member: targetName, evaluable });
    evalResult.detected = scenario_applied ? r.detected : null;
    evalResult.false_positives = r.false_positives;
  }

  // 8. Telegram.
  let telegram_ok = false;
  try { await sendMessage(messageText); telegram_ok = true; } catch (e) { console.error('telegram send failed:', e.message); }

  // 9. Persist. `simulated` ⇒ "contains any synthetic member".
  const data = {
    generated_at: today.toISOString(),
    simulated: members.some((m) => !m.real),
    scenario: label, scenario_member: targetId,
    members, baselines, report, report_valid, eval: evalResult,
    telemetry: { gate_fired, scenario_pool_size, scenario_pool_valid, llm_ms, model, telegram_ok },
  };
  await write(storePath, data);
  return data;
}

// CLI entry — only runs when invoked directly (not when imported by tests).
// pathToFileURL handles Windows/spaces/symlinks correctly (plain `file://` + argv[1] does not).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const llmClient = makeClient(getConfig(env));
  const tgConfig = getTelegramConfig(env);
  const data = await run({
    today: new Date(),
    env,
    scenario: env.SCENARIO || 'auto',      // production default: quiet-by-default gate
    force: env.FORCE_SCENARIO === '1',     // workflow_dispatch sets this to force a scenario
    llmClient,
    sendMessage: (text) => sendTelegram(text, tgConfig),
  });
  console.log(`Wrote data.json — scenario "${data.scenario}", gate_fired=${data.telemetry.gate_fired}, headline: ${data.report?.headline ?? '(unavailable)'}`);

  // Archive the full daily store so the dashboard can browse history (rolling 30 days).
  const date = data.report?.date || data.generated_at.slice(0, 10);
  await mkdir('history', { recursive: true });
  await writeStore(`history/${date}.json`, data);
  let existingIndex = [];
  try { existingIndex = await readStore('history/index.json'); } catch { /* first run — no index yet */ }
  const { index, pruned } = updateHistoryIndex(existingIndex, date, 30);
  await writeStore('history/index.json', index);
  for (const d of pruned) { try { await rm(`history/${d}.json`); } catch { /* already gone */ } }
  console.log(`Archived history/${date}.json (${index.length} days in history)`);
}
