// src/metrics.js

export const METRICS = ['rhr', 'sleep_eff', 'steps', 'hrv'];

export const METRIC_META = {
  rhr:       { label: 'Resting HR',       unit: 'bpm',   better: 'lower'  },
  sleep_eff: { label: 'Sleep efficiency', unit: '%',     better: 'higher' },
  steps:     { label: 'Steps',            unit: 'steps', better: 'higher' },
  hrv:       { label: 'HRV',              unit: 'ms',    better: 'higher' },
};

// Daily wobble (std) per metric — small, so anomalies stand out.
export const NOISE = { rhr: 2.0, sleep_eff: 2.5, steps: 1500, hrv: 5.0 };

export function roundMetric(metric, v) {
  if (metric === 'steps') return Math.max(0, Math.round(v));
  if (metric === 'sleep_eff') return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
  return Math.round(v * 10) / 10;
}
