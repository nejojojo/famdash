// tests/store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStore, writeStore } from '../src/store.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('writeStore then readStore round-trips', async () => {
  const path = join(tmpdir(), `fha-${process.pid}.json`);
  const data = { simulated: true, members: [{ id: 'm1' }] };
  await writeStore(path, data);
  assert.deepEqual(await readStore(path), data);
});
