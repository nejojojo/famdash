// tests/generator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDay, generateMemberSeries, generateNormalData } from '../src/generator.js';
import { PROFILES, METRICS } from '../src/metrics.js';
import { computeBaseline, zScore } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');

test('isoDay counts back in whole days', () => {
  assert.equal(isoDay(TODAY, 0), '2026-06-03');
  assert.equal(isoDay(TODAY, 1), '2026-06-02');
});

test('series is deterministic given a seed and has days+1 entries', () => {
  const a = generateMemberSeries(PROFILES[0], { today: TODAY, days: 30, seed: 5 });
  const b = generateMemberSeries(PROFILES[0], { today: TODAY, days: 30, seed: 5 });
  assert.equal(a.length, 31);
  assert.deepEqual(a, b);
});

test('values sit near the profile mean (realistic, not wild)', () => {
  const s = generateMemberSeries(PROFILES[0], { today: TODAY, days: 60, seed: 3 });
  const hist = s.slice(0, -1);
  const base = computeBaseline(hist);
  for (const m of METRICS) {
    assert.ok(Math.abs(base[m].mean - PROFILES[0].means[m]) < PROFILES[0].means[m] * 0.1,
      `${m} mean ${base[m].mean} far from profile ${PROFILES[0].means[m]}`);
  }
});

test('on a normal day extreme |z|>=3 values stay within the statistical tail', () => {
  let total = 0, extreme = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const members = generateNormalData({ today: TODAY, days: 30, baseSeed: seed });
    for (const mem of members) {
      const base = computeBaseline(mem.history);
      for (const metric of METRICS) {
        const z = zScore(mem.today[metric], base[metric]);
        if (z == null) continue;
        total++;
        if (Math.abs(z) >= 3) extreme++;
      }
    }
  }
  const frac = extreme / total;
  assert.ok(frac < 0.02, `|z|>=3 fraction ${(frac * 100).toFixed(2)}% exceeds 2% tail (n=${total})`);
});

test('sleep deviation couples to NEXT-day rhr (negative) and hrv (positive) with real effect size', () => {
  const s = generateMemberSeries(PROFILES[0], { today: TODAY, days: 400, seed: 17 });
  const base = computeBaseline(s.slice(0, -1));
  const sleepDev = s.map((d) => d.sleep_eff - base.sleep_eff.mean);
  const rhrDev = s.map((d) => d.rhr - base.rhr.mean);
  const hrvDev = s.map((d) => d.hrv - base.hrv.mean);

  const corr = (a, b) => {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n;
    const mb = b.reduce((s, x) => s + x, 0) / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
    return cov / Math.sqrt(va * vb);
  };

  const sleepT = sleepDev.slice(0, -1);
  const rhrNext = rhrDev.slice(1);
  const hrvNext = hrvDev.slice(1);
  const cRhr = corr(sleepT, rhrNext);
  const cHrv = corr(sleepT, hrvNext);

  assert.ok(cRhr < 0, `sleep→next-day rhr corr ${cRhr.toFixed(3)} should be negative`);
  assert.ok(cHrv > 0, `sleep→next-day hrv corr ${cHrv.toFixed(3)} should be positive`);
  assert.ok(Math.abs(cRhr) >= 0.1, `sleep→rhr coupling ${cRhr.toFixed(3)} too weak (|corr|>=0.1)`);
  assert.ok(Math.abs(cHrv) >= 0.1, `sleep→hrv coupling ${cHrv.toFixed(3)} too weak (|corr|>=0.1)`);
});

test('generateNormalData returns 3 members with history + today', () => {
  const members = generateNormalData({ today: TODAY, days: 30, baseSeed: 1 });
  assert.equal(members.length, 3);
  for (const mem of members) {
    assert.equal(mem.history.length, 30);
    assert.ok(mem.today && mem.today.date === '2026-06-03');
  }
});
