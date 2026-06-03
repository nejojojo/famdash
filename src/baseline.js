// src/baseline.js
import { METRICS } from './metrics.js';

export function mean(xs) {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// Trailing baseline from a member's history (which already excludes `today`).
// Null/missing values are dropped per metric.
export function computeBaseline(history) {
  const out = {};
  for (const metric of METRICS) {
    const xs = history.filter((d) => d && d[metric] != null).map((d) => d[metric]);
    out[metric] = { mean: mean(xs), std: std(xs) };
  }
  return out;
}

// Standard score of a value vs a {mean,std} baseline. null when not computable.
export function zScore(value, base) {
  if (value == null || base == null || base.mean == null) return null;
  if (!base.std) return 0;
  return (value - base.mean) / base.std;
}
