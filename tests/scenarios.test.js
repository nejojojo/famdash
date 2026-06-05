// tests/scenarios.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_SCENARIOS, applyPerturbations, applyStaleData, validateScenario } from '../src/scenarios.js';
import { loadMemberData } from '../src/sources.js';
import { computeBaseline, zScore } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');
const SYN = [
  { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
  { id: 'm2', name: 'Dad', source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500, hrv: 48 } },
  { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
];
const fresh = async () => Promise.all(SYN.map((m, i) => loadMemberData(m, { today: TODAY, days: 30, seed: 21 + i * 1000 })));

test('fixed scenarios are exactly all_normal and stale_data', () => {
  assert.deepEqual(FIXED_SCENARIOS, ['all_normal', 'stale_data']);
});

test('applyPerturbations shifts today and pushes z-score out', async () => {
  const members = await fresh();
  const target = members[1];
  const before = zScore(target.today.rhr, computeBaseline(target.history).rhr);
  applyPerturbations(target, [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -8 } }]);
  const after = zScore(target.today.rhr, computeBaseline(target.history).rhr);
  assert.ok(after > before + 2, `rhr z should jump (before ${before}, after ${after})`);
});

test('applyStaleData nulls today and the prior day (synced 2 days ago)', async () => {
  const members = await fresh();
  const target = members[2];
  applyStaleData(target, 2);
  assert.equal(target.today, null);
  const last = target.history[target.history.length - 1];
  assert.equal(last.rhr, null);
  assert.ok(last.date, 'date is preserved on a missing day');
});

test('validateScenario accepts good shape and rejects emergencies', () => {
  assert.ok(validateScenario({ label: 'mild_illness', perturbations: [{ offset: 0, deltas: { rhr: 6 } }] }).ok);
  assert.equal(validateScenario({ label: 'x', perturbations: [{ offset: 0, deltas: { rhr: 60 } }] }).ok, false);
  assert.equal(validateScenario({ label: 'x', perturbations: [{ offset: 0, deltas: { bp: 5 } }] }).ok, false);
});
