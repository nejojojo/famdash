// tests/scenarios.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_SCENARIOS, applyPerturbations, applyStaleData, validateScenario } from '../src/scenarios.js';
import { generateNormalData } from '../src/generator.js';
import { computeBaseline, zScore } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');
const fresh = () => generateNormalData({ today: TODAY, days: 30, baseSeed: 21 });

test('fixed scenarios are exactly all_normal and stale_data', () => {
  assert.deepEqual(FIXED_SCENARIOS, ['all_normal', 'stale_data']);
});

test('applyPerturbations shifts today and pushes z-score out', () => {
  const members = fresh();
  const target = members[1];
  const before = zScore(target.today.rhr, computeBaseline(target.history).rhr);
  applyPerturbations(target, [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -8 } }]);
  const after = zScore(target.today.rhr, computeBaseline(target.history).rhr);
  assert.ok(after > before + 2, `rhr z should jump (before ${before}, after ${after})`);
});

test('applyStaleData nulls today and the prior day (synced 2 days ago)', () => {
  const members = fresh();
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
