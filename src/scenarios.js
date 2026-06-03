// src/scenarios.js
import { METRICS, roundMetric } from './metrics.js';

export const FIXED_SCENARIOS = ['all_normal', 'stale_data'];

// Largest plausible single-day delta per metric. Bigger => "emergency territory" => rejected.
// Keeps LLM scenarios in drift / fatigue / mild-illness range (non-emergency goal).
const MAX_DELTA = { rhr: 18, sleep_eff: 30, steps: 9000, hrv: 35 };

// Mutate a member's recent days in place. offset 0 = today, 1 = yesterday, …
// perturbations: [{ offset, deltas: { rhr: +8, hrv: -12, … } }]
export function applyPerturbations(member, perturbations) {
  const series = member.today ? [...member.history, member.today] : [...member.history];
  const lastIdx = series.length - 1; // today (or most recent) is last
  for (const p of perturbations) {
    const idx = lastIdx - p.offset;
    if (idx < 0 || !series[idx]) continue;
    for (const metric of METRICS) {
      const delta = p.deltas?.[metric];
      if (delta != null && series[idx][metric] != null) {
        series[idx][metric] = roundMetric(metric, series[idx][metric] + delta);
      }
    }
  }
}

// Member stopped syncing `missingDays` ago: today=null + (missingDays-1) prior days nulled.
export function applyStaleData(member, missingDays = 2) {
  member.today = null;
  for (let k = 0; k < missingDays - 1; k++) {
    const idx = member.history.length - 1 - k;
    if (idx >= 0) {
      member.history[idx] = { date: member.history[idx].date, rhr: null, sleep_eff: null, steps: null, hrv: null };
    }
  }
}

// Validate an LLM-proposed scenario: known metrics, numeric deltas within non-emergency bounds.
export function validateScenario(scenario) {
  if (!scenario || typeof scenario.label !== 'string' || !Array.isArray(scenario.perturbations)) {
    return { ok: false, reason: 'missing label or perturbations[]' };
  }
  for (const p of scenario.perturbations) {
    if (typeof p.offset !== 'number' || p.offset < 0 || !p.deltas || typeof p.deltas !== 'object') {
      return { ok: false, reason: 'bad perturbation entry' };
    }
    for (const [metric, delta] of Object.entries(p.deltas)) {
      if (!METRICS.includes(metric)) return { ok: false, reason: `unknown metric ${metric}` };
      if (typeof delta !== 'number' || Number.isNaN(delta)) return { ok: false, reason: `non-numeric delta for ${metric}` };
      if (Math.abs(delta) > MAX_DELTA[metric]) return { ok: false, reason: `${metric} delta ${delta} exceeds non-emergency bound` };
    }
  }
  return { ok: true };
}
