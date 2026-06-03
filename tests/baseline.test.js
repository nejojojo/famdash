// tests/baseline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, std, computeBaseline, zScore } from '../src/baseline.js';

test('mean and std of a known set', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(Math.abs(std([2, 4, 6]) - 2) < 1e-9); // sample std
});

test('computeBaseline returns mean+std per metric and ignores null days', () => {
  const history = [
    { date: 'd1', rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 },
    { date: 'd2', rhr: 60, sleep_eff: 88, steps: 9500, hrv: 63 },
    { date: 'd3', rhr: null, sleep_eff: null, steps: null, hrv: null }, // missing day skipped
  ];
  const b = computeBaseline(history);
  assert.equal(b.rhr.mean, 59);
  assert.ok(b.rhr.std > 0);
  assert.ok(b.sleep_eff.mean === 89);
});

test('zScore handles zero std and nulls', () => {
  assert.equal(zScore(62, { mean: 58, std: 2 }), 2);
  assert.equal(zScore(58, { mean: 58, std: 0 }), 0);
  assert.equal(zScore(null, { mean: 58, std: 2 }), null);
  assert.equal(zScore(62, null), null);
});
