// src/scenarioGenerator.js
import { validateScenario } from './scenarios.js';
import { METRICS } from './metrics.js';

const POOL_SCHEMA = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          perturbations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                offset: { type: 'integer' },
                deltas: {
                  type: 'object',
                  properties: Object.fromEntries(METRICS.map((m) => [m, { type: 'number' }])),
                },
              },
              required: ['offset', 'deltas'],
            },
          },
        },
        required: ['label', 'perturbations'],
      },
    },
  },
  required: ['scenarios'],
};

const POOL_PROMPT = `You design plausible, NON-EMERGENCY wearable-health anomaly scenarios for a demo.
Each scenario targets ONE person over one or a few recent days and is expressed ONLY as numeric deltas
to add to that person's daily metrics. Metrics and realistic single-day delta ranges:
- rhr (resting HR, bpm): drift up to about +12 for stress/illness/poor recovery
- sleep_eff (%): down to about -20 for bad nights
- steps: down a few thousand for fatigue/illness, or up for overtraining
- hrv (ms): down to about -20 for poor recovery / oncoming illness
Stay in "worth a check-in" territory — NO acute emergencies, nothing that should trigger an ambulance.
Produce 8 varied scenarios (e.g. elevated RHR, poor recovery, oncoming illness, dehydration,
overtraining, jet lag, stress week, and others you invent). 'offset' 0 = today, 1 = yesterday.
Return JSON: { "scenarios": [ { "label": string, "perturbations": [ { "offset": int, "deltas": { metric: number } } ] } ] }.`;

// Ask the LLM for a pool, then keep only scenarios that pass non-emergency validation.
export async function generateScenarioPool(client) {
  const out = await client.generateJson(POOL_PROMPT, POOL_SCHEMA);
  const scenarios = Array.isArray(out?.scenarios) ? out.scenarios : [];
  return scenarios.filter((s) => validateScenario(s).ok);
}

// Deterministic pick (wraps). Index chosen by the caller (e.g. from SEED).
export function pickScenario(pool, index = 0) {
  if (pool.length === 0) return null;
  return pool[index % pool.length];
}
