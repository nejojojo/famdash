// tests/sources.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFamily, MIN_DAYS, FRESHNESS_DAYS, RANGES } from '../src/sources.js';

const good = JSON.stringify({
  family: 'F',
  members: [
    { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
    { id: 'me', name: 'Me', source: 'feed' },
  ],
});

test('constants are sane', () => {
  assert.equal(MIN_DAYS, 7);
  assert.equal(FRESHNESS_DAYS, 2);
  assert.deepEqual(RANGES.sleep_eff, [0, 100]);
});

test('loadFamily parses members', () => {
  const { family, members } = loadFamily(good);
  assert.equal(family, 'F');
  assert.equal(members.length, 2);
});

test('loadFamily rejects invalid JSON', () => {
  assert.throws(() => loadFamily('{not json'), /valid JSON/);
});

test('loadFamily rejects duplicate ids', () => {
  const dup = JSON.stringify({ members: [{ id: 'a', source: 'feed', name: 'A' }, { id: 'a', source: 'feed', name: 'B' }] });
  assert.throws(() => loadFamily(dup), /duplicate id/);
});

test('loadFamily rejects unknown source', () => {
  const bad = JSON.stringify({ members: [{ id: 'a', name: 'A', source: 'magic' }] });
  assert.throws(() => loadFamily(bad), /bad source/);
});

test('loadFamily rejects synthetic with partial means', () => {
  const bad = JSON.stringify({ members: [{ id: 'a', name: 'A', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000 } }] });
  assert.throws(() => loadFamily(bad), /means\.hrv/);
});

import { loadMemberData } from '../src/sources.js';

const TODAY = new Date('2026-06-03T12:00:00Z');

test('loadMemberData synthetic builds a member with history+today, real:false', async () => {
  const m = { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } };
  const mem = await loadMemberData(m, { today: TODAY, days: 30, seed: 7 });
  assert.equal(mem.id, 'm1');
  assert.equal(mem.name, 'Mom');
  assert.equal(mem.real, false);
  assert.equal(mem.history.length, 30);
  assert.equal(mem.today.date, '2026-06-03');
});

test('loadMemberData synthetic is deterministic by seed', async () => {
  const m = { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } };
  const a = await loadMemberData(m, { today: TODAY, days: 30, seed: 7 });
  const b = await loadMemberData(m, { today: TODAY, days: 30, seed: 7 });
  assert.deepEqual(a.today, b.today);
});

import { normalizeFeed } from '../src/sources.js';
const NF_T = new Date('2026-06-03T12:00:00Z');

test('normalizeFeed builds a trailing window ending at today, today entry resolved', () => {
  const rows = [
    { date: '2026-06-03', rhr: 60, sleep_eff: 90, steps: 8000, hrv: 60 },
    { date: '2026-06-02', rhr: 59, sleep_eff: 88, steps: 7000, hrv: 61 },
  ];
  const { history, today } = normalizeFeed(rows, { today: NF_T, days: 30 });
  assert.equal(history.length, 30);
  assert.equal(history[history.length - 1].date, '2026-06-02'); // yesterday is last history day
  assert.equal(today.date, '2026-06-03');
});

test('normalizeFeed drops future dates and dedupes by date (last wins)', () => {
  const rows = [
    { date: '2026-06-03', rhr: 60, sleep_eff: 90, steps: 8000, hrv: 60 },
    { date: '2026-06-03', rhr: 70, sleep_eff: 80, steps: 5000, hrv: 50 }, // later dup wins
    { date: '2026-06-09', rhr: 61, sleep_eff: 90, steps: 8000, hrv: 60 }, // future, dropped
  ];
  const { today } = normalizeFeed(rows, { today: NF_T, days: 30 });
  assert.equal(today.rhr, 70);
});

test('normalizeFeed clamps out-of-range / non-numeric metrics to null', () => {
  const rows = [{ date: '2026-06-03', rhr: 9, sleep_eff: 150, steps: 8000, hrv: 'x' }];
  const { today } = normalizeFeed(rows, { today: NF_T, days: 30 });
  assert.equal(today.rhr, null);        // 9 < 30
  assert.equal(today.sleep_eff, null);  // 150 > 100
  assert.equal(today.steps, 8000);      // in range
  assert.equal(today.hrv, null);        // non-numeric
});

const FEED = { id: 'me', name: 'Me', source: 'feed' };
const fullFeed = (today) => Array.from({ length: 20 }, (_, i) => ({
  date: new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10),
  rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65,
}));

test('feed member with fresh full feed → real:true, feed_state ok, today set', async () => {
  const mem = await loadMemberData(FEED, { today: TODAY, days: 30, readFeed: async () => fullFeed(TODAY) });
  assert.equal(mem.real, true);
  assert.equal(mem.feed_state, 'ok');
  assert.equal(mem.today.date, '2026-06-03');
});

test('feed member with too few days → never_synced, today null', async () => {
  const rows = fullFeed(TODAY).slice(0, 3);
  const mem = await loadMemberData(FEED, { today: TODAY, days: 30, readFeed: async () => rows });
  assert.equal(mem.feed_state, 'never_synced');
  assert.equal(mem.today, null);
});

test('feed member with data but missing today → stale, today null', async () => {
  const rows = fullFeed(new Date(TODAY.getTime() - 3 * 86400000)); // newest is 3 days ago
  const mem = await loadMemberData(FEED, { today: TODAY, days: 30, readFeed: async () => rows });
  assert.equal(mem.feed_state, 'stale');
  assert.equal(mem.today, null);
});

test('feed member whose readFeed throws → error state, today null, real:true', async () => {
  const mem = await loadMemberData(FEED, { today: TODAY, days: 30, readFeed: async () => { throw new Error('nope'); } });
  assert.equal(mem.feed_state, 'error');
  assert.equal(mem.today, null);
  assert.equal(mem.real, true);
});
