// tests/scenarioGenerator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateScenarioPool, pickScenario } from '../src/scenarioGenerator.js';

const fakeClient = (payload) => ({ model: 'fake', async generateJson() { return payload; } });

test('generateScenarioPool keeps valid, drops invalid/emergency scenarios', async () => {
  const client = fakeClient({
    scenarios: [
      { label: 'poor_recovery', perturbations: [{ offset: 0, deltas: { rhr: 7, hrv: -12, sleep_eff: -9 } }] },
      { label: 'emergency',     perturbations: [{ offset: 0, deltas: { rhr: 55 } }] },      // dropped
      { label: 'bad_metric',    perturbations: [{ offset: 0, deltas: { spo2: -5 } }] },     // dropped
    ],
  });
  const pool = await generateScenarioPool(client);
  assert.equal(pool.length, 1);
  assert.equal(pool[0].label, 'poor_recovery');
});

test('pickScenario is deterministic given an index', () => {
  const pool = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
  assert.equal(pickScenario(pool, 1).label, 'b');
  assert.equal(pickScenario(pool, 3).label, 'a'); // wraps (3 % 3 = 0)
});
