// tests/llm.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, makeClient, stripFence } from '../src/llm.js';

test('getConfig reads env with a sensible default model', () => {
  const c = getConfig({ GEMINI_API_KEY: 'k' });
  assert.equal(c.apiKey, 'k');
  assert.equal(c.model, 'gemini-2.5-flash');
  assert.equal(getConfig({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-pro' }).model, 'gemini-2.5-pro');
});

test('makeClient throws clearly when key is missing', () => {
  assert.throws(() => makeClient({ apiKey: '', model: 'm' }), /GEMINI_API_KEY/);
});

test('stripFence removes a ```json code fence some models add', () => {
  assert.equal(stripFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripFence('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripFence('{"a":1}'), '{"a":1}');
  assert.equal(stripFence('  {"a":1}  '), '{"a":1}');
});
