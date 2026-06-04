// analyst.js  (repo root — the entrypoint GitHub Actions runs)
import { generateNormalData } from './src/generator.js';
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

// Scenario-family-aware scoring of the analyst against the stored answer key. The expected target
// status differs per family: perturbation ⇒ 'worth_noting', stale_data ⇒ 'no_data', all_normal ⇒
// no target. A 'no_data' is NEVER a false positive; only a NON-target 'worth_noting' is.
export function evalReport(report, { scenario_family, target_member }) {
  const expected = scenario_family === 'stale_data' ? 'no_data'
                 : scenario_family === 'perturbation' ? 'worth_noting'
                 : null;
  const byName = new Map(report.members.map((m) => [m.name, m.status]));
  const detected = target_member != null ? byName.get(target_member) === expected : null;
  const false_positives = report.members
    .filter((m) => m.name !== target_member && m.status === 'worth_noting')
    .map((m) => m.name);
  return { detected, false_positives };
}

// Pure, fully-injectable pipeline. Returns the store object it wrote.
export async function run(deps) {
  const {
    today,
    env = {},
    scenario = 'auto',     // 'auto' is gated; 'all_normal'|'stale_data'|'llm' bypass the gate
    force = false,         // workflow_dispatch can force a scenario on a gated day
    llmClient,
    scenarioPool = (client) => generateScenarioPool(client),
    sendMessage,
    write = writeStore,
    storePath = 'data.json',
  } = deps;

  // Daily seed + target rotate with the UTC date so the data differs each day and the flagged
  // member is not always the same person (was: fixed seed ⇒ always Sam).
  const dateHash = hashDate(today);
  const seed = dateHash % 100000;

  // 1. Everyone normal (clean).
  const members = generateNormalData({ today, days: 30, baseSeed: seed });
  const targetIdx = dateHash % members.length;

  // 2. Baselines computed ONCE from CLEAN history, BEFORE any scenario mutates the data, so a
  //    multi-day anomaly can't fold into the very baseline meant to reveal it. applyPerturbations
  //    mutates day objects in place (history too, for offset>0) and applyStaleData nulls trailing
  //    days — both must run AFTER this. Consumed by the analyst AND written for the dashboard.
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));

  // 3. Resolve the EFFECTIVE scenario. 'auto' is gated (quiet by default); explicit values bypass
  //    the gate so operators and demos still work.
  let gate_fired = false;
  let effective = scenario;
  if (scenario === 'auto') {
    gate_fired = shouldFireScenario(today, { force });
    effective = gate_fired ? 'llm' : 'all_normal';
  }

  // 4. Apply the effective scenario to ONE member. Label is operator-only (never sent to the LLM).
  let label = 'all_normal';
  let targetId = null;
  let scenario_pool_size = 0;
  let scenario_pool_valid = 0;
  if (effective === 'stale_data') {
    applyStaleData(members[targetIdx], 2);
    label = 'stale_data';
    targetId = members[targetIdx].id;
  } else if (effective === 'llm') {
    const pool = await scenarioPool(llmClient);
    scenario_pool_size = pool.length;
    scenario_pool_valid = pool.filter((s) => validateScenario(s).ok).length;
    const chosen = pickScenario(pool, seed);
    if (chosen) {
      applyPerturbations(members[targetIdx], chosen.perturbations);
      label = chosen.label;
      targetId = members[targetIdx].id;
    } else {
      label = 'all_normal'; // pool empty ⇒ fall back to a quiet day (logged for telemetry)
      console.warn('scenario pool empty — falling back to all_normal');
    }
  }
  const targetName = targetId ? members[targetIdx].name : null;

  // 5. Analyst sees data + baselines only — never the label. Tolerate a thrown/garbage response.
  const t0 = Date.now();
  let report = null;
  try { report = await runAnalyst(llmClient, members, baselines); }
  catch (e) { console.error('analyst failed:', e.message); }
  const llm_ms = Date.now() - t0;
  const model = llmClient?.model || env.GEMINI_MODEL || 'gemini-flash';

  // 6. Validate the (real, untrusted) LLM output. On failure, send a safe plain-text fallback
  //    rather than shipping a broken report — but still write the store for the dashboard.
  const report_valid = report ? validateReport(report, members).ok : false;
  const messageText = report_valid
    ? formatReport(report)
    : 'Daily Health Report unavailable today (technical issue) — data is synthetic, no action needed.';

  // 7. Scenario-family-aware eval against the stored answer key (only meaningful on a valid report).
  const fam = scenarioFamily(label);
  const scenario_applied = label !== 'all_normal';
  let evalResult = { scenario_applied, scenario_family: fam, target_member: targetName, detected: null, false_positives: [] };
  if (report_valid) {
    const r = evalReport(report, { scenario_family: fam, target_member: targetName });
    evalResult.detected = scenario_applied ? r.detected : null;
    evalResult.false_positives = r.false_positives;
  }

  // 8. Push to Telegram. Record the outcome; never let a send failure lose the store.
  let telegram_ok = false;
  try { await sendMessage(messageText); telegram_ok = true; }
  catch (e) { console.error('telegram send failed:', e.message); }

  // 9. Persist the store (label is top-level, operator-only).
  const data = {
    generated_at: today.toISOString(),
    simulated: true,
    scenario: label,
    scenario_member: targetId,
    members,
    baselines,
    report,
    report_valid,
    eval: evalResult,
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
