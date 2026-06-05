// tests/check-feed.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeed } from '../src/check-feed.js';

const T = new Date('2026-06-03T12:00:00Z');
const ok = Array.from({ length: 10 }, (_, i) => ({
  date: new Date(T.getTime() - i * 86400000).toISOString().slice(0, 10),
  rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65,
}));

test('valid feed passes', () => {
  assert.equal(validateFeed(ok, { today: T }).ok, true);
});

test('not an array fails', () => {
  assert.equal(validateFeed({}, { today: T }).ok, false);
});

test('too few days fails', () => {
  assert.equal(validateFeed(ok.slice(0, 3), { today: T }).ok, false);
});

test('out-of-range metric fails', () => {
  const bad = [{ ...ok[0], rhr: 9 }, ...ok.slice(1)];
  const r = validateFeed(bad, { today: T });
  assert.equal(r.ok, false);
  assert.match(r.reason, /rhr/);
});

test('stale newest date fails', () => {
  const stale = ok.map((d) => ({ ...d, date: new Date(new Date(d.date).getTime() - 5 * 86400000).toISOString().slice(0, 10) }));
  assert.equal(validateFeed(stale, { today: T }).ok, false);
});
