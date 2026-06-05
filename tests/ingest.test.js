import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFeedRow } from '../src/sources.js';
import { buildMerged } from '../src/ingest.js';

const T = new Date('2026-06-05T14:00:00Z');

test('mergeFeedRow upserts today and dedupes by date (the new row wins)', () => {
  const history = [
    { date: '2026-06-04', steps: 100, rhr: 58, hrv: 60 },
    { date: '2026-06-05', steps: 1, rhr: 0, hrv: 0 }, // a partial earlier read of today
  ];
  const row = { date: '2026-06-05', steps: 9000, rhr: 58, hrv: 65 };
  const merged = mergeFeedRow(history, row, { today: T });
  assert.equal(merged.length, 2);
  assert.equal(merged[merged.length - 1].steps, 9000); // fresh row replaced the partial one
});

test('mergeFeedRow drops future-dated rows', () => {
  const merged = mergeFeedRow([], { date: '2026-06-10', steps: 5 }, { today: T });
  assert.deepEqual(merged, []);
});

test('mergeFeedRow tolerates a corrupt (non-array) history and sorts ascending', () => {
  const merged = mergeFeedRow('not an array', { date: '2026-06-05', steps: 5 }, { today: T });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].date, '2026-06-05');
});

test('mergeFeedRow keeps only the most recent keepDays', () => {
  const history = Array.from({ length: 40 }, (_, i) => {
    const d = new Date('2026-04-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), steps: i };
  });
  const merged = mergeFeedRow(history, null, { today: T, keepDays: 35 });
  assert.equal(merged.length, 35);
  assert.equal(merged[0].date, history[5].date); // dropped the 5 oldest
});

test('buildMerged accepts a single object OR a 1-element array push', () => {
  const a = buildMerged({ date: '2026-06-05', steps: 9000 }, [], { today: T });
  const b = buildMerged([{ date: '2026-06-05', steps: 9000 }], [], { today: T });
  assert.deepEqual(a, b);
  assert.equal(a[0].steps, 9000);
});

test('buildMerged with no latest push just cleans the existing history', () => {
  const merged = buildMerged(null, [{ date: '2026-06-04', steps: 100 }], { today: T });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].date, '2026-06-04');
});
