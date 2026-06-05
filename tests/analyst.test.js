// tests/analyst.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentWindow, buildMemberContext, buildPrompt, runAnalyst, validateReport, ANALYST_SCHEMA } from '../src/analyst.js';
import { loadMemberData } from '../src/sources.js';
import { applyPerturbations } from '../src/scenarios.js';
import { computeBaseline } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');
async function dataset() {
  const SYN = [
    { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
    { id: 'm2', name: 'Dad', source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500, hrv: 48 } },
    { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
  ];
  const members = await Promise.all(SYN.map((m, i) => loadMemberData(m, { today: TODAY, days: 30, seed: 31 + i * 1000 })));
  applyPerturbations(members[1], [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -9 } }]);
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));
  return { members, baselines, label: 'poor_recovery' };
}

test('recentWindow returns the last N days including today', async () => {
  const { members } = await dataset();
  const w = recentWindow(members[0], 7);
  assert.equal(w.length, 7);
  assert.equal(w[w.length - 1].date, '2026-06-03');
});

test('member context carries baseline + recent days but NO scenario label', async () => {
  const { members, baselines, label } = await dataset();
  const ctx = buildMemberContext(members[1], baselines);
  assert.ok(ctx.baseline.rhr.mean > 0);
  assert.ok(Array.isArray(ctx.recent_days));
  assert.ok(!JSON.stringify(ctx).includes(label), 'context must not leak the scenario label');
});

test('INFORMATION BARRIER: prompt never contains the scenario label', async () => {
  const { members, baselines, label } = await dataset();
  const prompt = buildPrompt(members, baselines);
  assert.ok(!prompt.includes(label), 'prompt leaked the hidden scenario label');
  assert.ok(prompt.includes('baseline'), 'prompt should present baselines');
});

test('runAnalyst passes the schema and returns the model JSON', async () => {
  const { members, baselines } = await dataset();
  let sawSchema = null, sawPrompt = null;
  const fake = { async generateJson(p, s) { sawPrompt = p; sawSchema = s; return { date: '2026-06-03', headline: 'ok', members: [] }; } };
  const out = await runAnalyst(fake, members, baselines);
  assert.equal(sawSchema, ANALYST_SCHEMA);
  assert.ok(sawPrompt.length > 0);
  assert.equal(out.headline, 'ok');
});

// --- validateReport: catches malformed real LLM output before write/send ---
const MEMBERS3 = [{ name: 'Mom' }, { name: 'Dad' }, { name: 'Sister' }];
const goodReport = () => ({
  date: '2026-06-03',
  headline: 'Three steady.',
  members: [
    { name: 'Mom', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
    { name: 'Dad', status: 'worth_noting', summary: 'rhr up', changed_signals: [{ metric: 'rhr', z: 2.4, phrase: 'resting heart rate noticeably higher than usual' }], suggestion: 'Take it easy.' },
    { name: 'Sister', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
  ],
});

test('validateReport accepts a well-formed report', () => {
  assert.equal(validateReport(goodReport(), MEMBERS3).ok, true);
});

test('validateReport rejects missing required top-level fields', () => {
  const r = goodReport(); delete r.headline;
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects a status not in the enum', () => {
  const r = goodReport(); r.members[1].status = 'alarm';
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects a member-name mismatch', () => {
  const r = goodReport(); r.members[0].name = 'Bob';
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects a member count != 3', () => {
  const r = goodReport(); r.members.pop();
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects changed_signals that is not an array', () => {
  const r = goodReport(); r.members[0].changed_signals = 'rhr +2.4σ';
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});
