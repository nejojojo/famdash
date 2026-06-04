// tests/history.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateHistoryIndex } from '../src/history.js';

test('adds a new date, newest first', () => {
  const { index, pruned } = updateHistoryIndex(['2026-06-01'], '2026-06-02', 30);
  assert.deepEqual(index, ['2026-06-02', '2026-06-01']);
  assert.deepEqual(pruned, []);
});

test('re-running the same date does not duplicate it', () => {
  const { index, pruned } = updateHistoryIndex(['2026-06-02', '2026-06-01'], '2026-06-02', 30);
  assert.deepEqual(index, ['2026-06-02', '2026-06-01']);
  assert.deepEqual(pruned, []);
});

test('caps to keep and prunes the oldest day', () => {
  const existing = Array.from({ length: 30 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`);
  const { index, pruned } = updateHistoryIndex(existing, '2026-07-01', 30);
  assert.equal(index.length, 30);
  assert.equal(index[0], '2026-07-01');       // newest first
  assert.deepEqual(pruned, ['2026-06-01']);   // oldest dropped out of the window
  assert.ok(!index.includes('2026-06-01'));
});

test('empty/undefined existing index is handled', () => {
  const { index, pruned } = updateHistoryIndex(undefined, '2026-06-04', 30);
  assert.deepEqual(index, ['2026-06-04']);
  assert.deepEqual(pruned, []);
});
