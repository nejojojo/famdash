// tests/run.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, shouldFireScenario, scenarioFamily, evalReport } from '../analyst.js';

const TODAY = new Date('2026-06-03T12:00:00Z');

function deps(overrides = {}) {
  const writes = {};
  return {
    today: TODAY,
    env: {},
    llmClient: {
      _prompt: null,
      async generateJson(prompt) {
        this._prompt = prompt;
        // echo a valid 3-member report; names filled by run() are Alex/Sam/Priya
        return {
          date: '2026-06-03', headline: 'h',
          members: [
            { name: 'Alex', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
            { name: 'Sam', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
            { name: 'Priya', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
          ],
        };
      },
    },
    scenarioPool: async () => ([
      { label: 'poor_recovery', perturbations: [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -9 } }] },
    ]),
    sendMessage: async (text) => { writes.sent = true; writes.sentText = text; },
    write: async (path, data) => { writes[path] = data; },
    writes,
    ...overrides,
  };
}

// --- shouldFireScenario: the quiet-by-default cadence gate ---
test('shouldFireScenario fires on 8–18% of days across a year (deterministic, no force)', () => {
  let fired = 0;
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365; i++) {
    if (shouldFireScenario(new Date(base + i * 86400000), {})) fired++;
  }
  const frac = fired / 365;
  assert.ok(frac >= 0.08 && frac <= 0.18, `fired fraction ${(frac * 100).toFixed(1)}% outside 8–18% band`);
});

test('shouldFireScenario is deterministic per date', () => {
  const d = new Date('2026-06-03T00:00:00Z');
  assert.equal(shouldFireScenario(d, {}), shouldFireScenario(new Date('2026-06-03T23:59:00Z'), {}));
});

test('shouldFireScenario force:true always fires', () => {
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 30; i++) {
    assert.equal(shouldFireScenario(new Date(base + i * 86400000), { force: true }), true);
  }
});

test('gate-false day yields all_normal with no member perturbed', async () => {
  // find a date the gate does NOT fire, drive run() with scenario:'auto' (gated path)
  let quietDay = null;
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365 && !quietDay; i++) {
    const d = new Date(base + i * 86400000);
    if (!shouldFireScenario(d, {})) quietDay = d;
  }
  const d = deps({ today: quietDay, scenario: 'auto' });
  const data = await run(d);
  assert.equal(data.scenario, 'all_normal');
  assert.equal(data.scenario_member, null);
  assert.equal(data.eval.scenario_applied, false);
  assert.equal(data.eval.detected, null);
});

// --- core run() contract ---
test('explicit all_normal: no label, telegram sent, store consistent', async () => {
  const d = deps({ scenario: 'all_normal' });
  const data = await run(d);
  assert.equal(data.scenario, 'all_normal');
  assert.equal(data.simulated, true);
  assert.ok(data.baselines.m1.rhr.mean > 0);
  assert.ok(d.writes['data.json']);
  assert.ok(d.writes.sent, 'report pushed to telegram');
  assert.equal(data.eval.scenario_applied, false);
});

test('explicit SCENARIO bypasses the gate: llm label never reaches the analyst prompt', async () => {
  const d = deps({ scenario: 'llm' });
  const data = await run(d);
  assert.equal(data.scenario, 'poor_recovery');
  assert.ok(data.scenario_member, 'records which member was targeted');
  assert.ok(!d.llmClient._prompt.includes('poor_recovery'), 'INFORMATION BARRIER breached');
  assert.equal(data.eval.scenario_applied, true);
  assert.equal(data.eval.scenario_family, 'perturbation');
});

test('explicit stale_data: target member has today=null and eval expects no_data', async () => {
  const d = deps({ scenario: 'stale_data' });
  const data = await run(d);
  const stale = data.members.find((m) => m.id === data.scenario_member);
  assert.equal(stale.today, null);
  assert.equal(data.eval.scenario_family, 'stale_data');
});

test('baseline is computed from CLEAN data (uncontaminated by the injected anomaly)', async () => {
  const clean = deps({ scenario: 'all_normal' });
  const dirty = deps({ scenario: 'llm' });
  const c = await run(clean);
  const dr = await run(dirty);
  const target = dr.scenario_member;
  // perturbing only TODAY must not move that member's baseline mean vs the clean run
  assert.deepEqual(c.baselines[target].rhr, dr.baselines[target].rhr);
});

test('validateReport failure: fallback message sent, store still written, report flagged unavailable', async () => {
  const bad = deps({
    scenario: 'all_normal',
    llmClient: { async generateJson() { return { headline: 'no members here' }; } },
  });
  const data = await run(bad);
  assert.ok(bad.writes['data.json'], 'store still written on fallback');
  assert.ok(/unavailable/i.test(bad.writes.sentText), 'fallback plain-text message sent');
  assert.equal(data.report_valid, false);
  assert.equal(data.telemetry.telegram_ok, true);
});

test('telemetry is persisted', async () => {
  const d = deps({ scenario: 'llm' });
  const data = await run(d);
  const t = data.telemetry;
  assert.equal(typeof t.gate_fired, 'boolean');
  assert.equal(t.scenario_pool_size, 1);
  assert.equal(t.scenario_pool_valid, 1);
  assert.equal(typeof t.llm_ms, 'number');
  assert.ok(t.model !== undefined);
  assert.equal(t.telegram_ok, true);
});

// --- scenario-family-aware eval (offline, canned reports per family) ---
const MEMBERS3 = [{ id: 'm1', name: 'Alex' }, { id: 'm2', name: 'Sam' }, { id: 'm3', name: 'Priya' }];
const rep = (statuses) => ({
  date: 'd', headline: 'h',
  members: MEMBERS3.map((m, i) => ({ name: m.name, status: statuses[i], summary: '', changed_signals: [], suggestion: '' })),
});

test('scenarioFamily classifies labels', () => {
  assert.equal(scenarioFamily('all_normal'), 'all_normal');
  assert.equal(scenarioFamily('stale_data'), 'stale_data');
  assert.equal(scenarioFamily('poor_recovery'), 'perturbation');
});

test('eval: perturbation target worth_noting => detected', () => {
  const e = evalReport(rep(['all_clear', 'worth_noting', 'all_clear']),
    { scenario_family: 'perturbation', target_member: 'Sam' });
  assert.equal(e.detected, true);
  assert.deepEqual(e.false_positives, []);
});

test('eval: stale_data target no_data => detected=TRUE (not a miss)', () => {
  const e = evalReport(rep(['all_clear', 'no_data', 'all_clear']),
    { scenario_family: 'stale_data', target_member: 'Sam' });
  assert.equal(e.detected, true, 'a correct no_data on a stale target must score as detected');
  assert.deepEqual(e.false_positives, [], 'a no_data is not a false positive');
});

test('eval: all_normal with any worth_noting => false positive, detected=null', () => {
  const e = evalReport(rep(['all_clear', 'worth_noting', 'all_clear']),
    { scenario_family: 'all_normal', target_member: null });
  assert.equal(e.detected, null);
  assert.deepEqual(e.false_positives, ['Sam']);
});

test('eval: non-target worth_noting is a false positive', () => {
  const e = evalReport(rep(['worth_noting', 'worth_noting', 'all_clear']),
    { scenario_family: 'perturbation', target_member: 'Sam' });
  assert.equal(e.detected, true);
  assert.deepEqual(e.false_positives, ['Alex']);
});
