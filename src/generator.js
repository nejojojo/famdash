// src/generator.js
import { NOISE, roundMetric } from './metrics.js';
import { makeRng, gaussian } from './random.js';

// ISO (YYYY-MM-DD) for `daysAgo` days before the given `today` Date.
export function isoDay(today, daysAgo) {
  const d = new Date(today.getTime() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

// One member's series: `days` history entries + today (last). Deterministic by seed.
// Correlation: a poor-sleep night (negative sleep delta) raises NEXT day rhr, lowers hrv.
export function generateMemberSeries(profile, { today, days = 30, seed }) {
  const rng = makeRng(seed);
  const series = [];
  let prevSleepDelta = 0; // yesterday's deviation from sleep mean
  for (let i = days; i >= 0; i--) {
    const day = { date: isoDay(today, i) };

    const sleepRaw = gaussian(rng, profile.means.sleep_eff, NOISE.sleep_eff);
    const sleepDelta = sleepRaw - profile.means.sleep_eff;
    day.sleep_eff = roundMetric('sleep_eff', sleepRaw);

    // poor sleep yesterday (delta<0) => rhr up
    day.rhr = roundMetric('rhr', gaussian(rng, profile.means.rhr, NOISE.rhr) - 0.25 * prevSleepDelta);
    // poor sleep yesterday => hrv down
    day.hrv = roundMetric('hrv', gaussian(rng, profile.means.hrv, NOISE.hrv) + 0.30 * prevSleepDelta);
    // steps wobble independently
    day.steps = roundMetric('steps', gaussian(rng, profile.means.steps, NOISE.steps));

    series.push(day);
    prevSleepDelta = sleepDelta;
  }
  return series;
}

