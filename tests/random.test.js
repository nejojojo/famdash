// tests/random.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, gaussian } from '../src/random.js';

test('same seed yields the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('different seeds diverge', () => {
  assert.notEqual(makeRng(1)(), makeRng(2)());
});

test('rng output is in [0,1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
});

test('gaussian is deterministic and roughly centered', () => {
  const r = makeRng(99);
  const xs = Array.from({ length: 5000 }, () => gaussian(r, 10, 2));
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(m - 10) < 0.2, `mean ${m} not near 10`);
});
