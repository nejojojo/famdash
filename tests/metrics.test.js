// tests/metrics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, METRIC_META, NOISE, roundMetric } from '../src/metrics.js';

test('four canonical metrics in fixed order', () => {
  assert.deepEqual(METRICS, ['rhr', 'sleep_eff', 'steps', 'hrv']);
});

test('every metric has metadata and noise', () => {
  for (const m of METRICS) {
    assert.ok(METRIC_META[m].label, `no label for ${m}`);
    assert.ok(['lower', 'higher'].includes(METRIC_META[m].better));
    assert.equal(typeof NOISE[m], 'number');
  }
});


test('roundMetric clamps and rounds per metric', () => {
  assert.equal(roundMetric('steps', 9003.7), 9004);
  assert.equal(roundMetric('steps', -5), 0);
  assert.equal(roundMetric('sleep_eff', 105), 100);
  assert.equal(roundMetric('rhr', 58.27), 58.3);
});
