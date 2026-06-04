# Real-Data Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator add their own real Apple-Watch data as a 4th family member ("Me") via a per-person feed file committed by an Apple Shortcut, while Mom/Dad/Sister stay synthetic — config-driven, with graceful no-data handling and a validator.

**Architecture:** Replace hard-coded `PROFILES` with a committed `family.json` registry read by a new `src/sources.js` (synthetic → generator; feed → normalized `feeds/<id>.json`). `analyst.js`'s `run()` becomes config-driven: scenarios only target synthetic members, the analyst prompt includes only members with data, and the eval scores only an allow-list of synthetic names. Real members are flagged and labeled on the dashboard.

**Tech Stack:** Node 22 ESM, `node:test`, existing Gemini/Telegram/dashboard. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-04-real-data-onboarding-design.md` (rev 2).

---

## File structure

| File | Responsibility |
|------|----------------|
| `family.json` (new) | The single registry: members + source (`synthetic` w/ `means`, or `feed`). Replaces `PROFILES`. |
| `src/sources.js` (new) | `loadFamily`, `readFamilyFile`, `normalizeFeed`, `loadMemberData`, `readFeedFile`, constants (`MIN_DAYS`, `FRESHNESS_DAYS`, `RANGES`). |
| `src/metrics.js` (modify) | Remove `PROFILES`; keep `METRICS`/`METRIC_META`/`NOISE`/`roundMetric`. |
| `src/generator.js` (modify) | Remove `generateNormalData` + `PROFILES` import; keep `isoDay` + `generateMemberSeries(profile,…)`. |
| `analyst.js` (modify) | `run()` config-driven; `evalReport` gains an `evaluable` allow-list. |
| `src/check-feed.js` (new) | `validateFeed(rows,{today})` pure validator + CLI (exit codes). |
| `index.html` (modify) | `demo`/`● real` tag + `feed_state` copy + legend. |
| `src/telegram.js` (modify) | Disclosure line only when `simulated`. |
| `feeds/.gitkeep` (new) | Ensure `feeds/` exists; `feeds/<id>.json` is committed by the Shortcut. |
| `docs/ONBOARDING.md` (new) | Route B operator guide (PAT, Shortcut actions incl. GET-sha→PUT, automation). |
| `package.json` (modify) | `check-feed` script. |
| Tests | `tests/sources.test.js`, `tests/check-feed.test.js` (new); `tests/generator.test.js`, `tests/scenarios.test.js`, `tests/analyst.test.js`, `tests/run.test.js` (modify). |

**Phase 1 (Tasks 1–6):** config refactor, synthetic-only, behavior identical, all tests green.
**Phase 2 (Tasks 7–13):** real feed + validator + labeling + onboarding doc.

---

# PHASE 1 — Config refactor (no behavior change)

## Task 1: `family.json` registry (synthetic members)

**Files:**
- Create: `family.json`

- [ ] **Step 1: Create `family.json`** (the three synthetic members; "Me" is added in Phase 2)

```json
{
  "family": "Demo Family",
  "members": [
    { "id": "m1", "name": "Mom",    "source": "synthetic", "means": { "rhr": 58, "sleep_eff": 90, "steps": 9000,  "hrv": 65 } },
    { "id": "m2", "name": "Dad",    "source": "synthetic", "means": { "rhr": 62, "sleep_eff": 86, "steps": 6500,  "hrv": 48 } },
    { "id": "m3", "name": "Sister", "source": "synthetic", "means": { "rhr": 66, "sleep_eff": 88, "steps": 11000, "hrv": 55 } }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add family.json
git commit -m "feat: family.json registry (synthetic members)"
```

---

## Task 2: `src/sources.js` — `loadFamily` + constants

**Files:**
- Create: `src/sources.js`, `tests/sources.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sources.test.js`
Expected: FAIL — cannot find module `../src/sources.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/sources.js
import { readFileSync } from 'node:fs';
import { METRICS } from './metrics.js';

export const MIN_DAYS = 7;          // a real feed needs >= this many days before we trust its baseline
export const FRESHNESS_DAYS = 2;    // newest day must be within this many days to be "ok"
export const RANGES = { rhr: [30, 200], hrv: [5, 300], sleep_eff: [0, 100], steps: [0, 100000] };

// Parse + fail-fast validate family.json. Returns { family, members }.
export function loadFamily(text) {
  let cfg;
  try { cfg = JSON.parse(text); } catch { throw new Error('family.json is not valid JSON'); }
  if (!cfg || !Array.isArray(cfg.members)) throw new Error('family.json: members[] required');
  const ids = new Set();
  for (const m of cfg.members) {
    if (!m || !m.id || ids.has(m.id)) throw new Error(`family.json: missing or duplicate id ${JSON.stringify(m?.id)}`);
    ids.add(m.id);
    if (m.source !== 'synthetic' && m.source !== 'feed') {
      throw new Error(`family.json: ${m.id} has bad source ${JSON.stringify(m.source)}`);
    }
    if (m.source === 'synthetic') {
      for (const k of METRICS) {
        if (typeof m.means?.[k] !== 'number') throw new Error(`family.json: ${m.id} missing means.${k}`);
      }
    }
  }
  return { family: cfg.family || 'Family', members: cfg.members };
}

export function readFamilyFile(path = 'family.json') {
  return loadFamily(readFileSync(path, 'utf8'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sources.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sources.js tests/sources.test.js
git commit -m "feat: sources.loadFamily + constants"
```

---

## Task 3: `loadMemberData` (synthetic) + drop `PROFILES`/`generateNormalData`

**Files:**
- Modify: `src/sources.js`, `tests/sources.test.js`
- Modify: `src/metrics.js` (remove `PROFILES`), `src/generator.js` (remove `generateNormalData` + `PROFILES` import)
- Modify: `tests/generator.test.js` (stop importing `PROFILES`/`generateNormalData`)

- [ ] **Step 1: Write the failing test** (append to `tests/sources.test.js`)

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sources.test.js`
Expected: FAIL — `loadMemberData` is not exported.

- [ ] **Step 3: Add `loadMemberData` to `src/sources.js`** (append; feed branch added in Phase 2)

```js
import { generateMemberSeries } from './generator.js';

// Build one member's data from its source. Returns { id, name, real, history, today, feed_state? }.
export async function loadMemberData(member, { today, days, seed, readFeed }) {
  if (member.source === 'synthetic') {
    const series = generateMemberSeries({ means: member.means }, { today, days, seed });
    return { id: member.id, name: member.name, real: false, history: series.slice(0, -1), today: series[series.length - 1] };
  }
  // 'feed' branch implemented in Phase 2 (Task 8).
  throw new Error(`loadMemberData: source "${member.source}" not implemented`);
}
```

- [ ] **Step 4: Remove `PROFILES` from `src/metrics.js`**

Delete the entire `export const PROFILES = [ … ];` block. Keep `METRICS`, `METRIC_META`, `NOISE`, `roundMetric`.

- [ ] **Step 5: Update `src/generator.js`** — remove `PROFILES` from the import and delete `generateNormalData`

Change the import line:
```js
import { NOISE, roundMetric } from './metrics.js';
```
Delete the entire `export function generateNormalData(…) { … }` at the bottom of the file. Keep `isoDay` and `generateMemberSeries`.

- [ ] **Step 6: Update `tests/generator.test.js`** — replace `PROFILES`/`generateNormalData` usage with a local profile + `loadMemberData`

Replace the imports and the two affected tests:
```js
// tests/generator.test.js  (top)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDay, generateMemberSeries } from '../src/generator.js';
import { loadMemberData } from '../src/sources.js';
import { METRICS } from '../src/metrics.js';
import { computeBaseline, zScore } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');
const PROFILE = { means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } };
```
Update every `PROFILES[0]` to `PROFILE`. Replace the extreme-|z| and "3 members" tests' use of `generateNormalData({…})` with building members from `loadMemberData`:
```js
test('on a normal day extreme |z|>=3 values stay within the statistical tail', async () => {
  let total = 0, extreme = 0;
  const ms = [
    { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
    { id: 'm2', name: 'Dad', source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500, hrv: 48 } },
    { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
  ];
  for (let seed = 1; seed <= 200; seed++) {
    for (const mc of ms) {
      const mem = await loadMemberData(mc, { today: TODAY, days: 30, seed: seed + ms.indexOf(mc) * 1000 });
      const base = computeBaseline(mem.history);
      for (const metric of METRICS) {
        const z = zScore(mem.today[metric], base[metric]);
        if (z == null) continue;
        total++;
        if (Math.abs(z) >= 3) extreme++;
      }
    }
  }
  assert.ok(extreme / total < 0.02, `|z|>=3 fraction ${(extreme / total * 100).toFixed(2)}% exceeds 2%`);
});
```
Delete the old `generateNormalData returns 3 members…` test (its coverage moves to `tests/sources.test.js` Task 3 Step 1). Keep the `isoDay`, determinism, near-mean, and correlation tests (they use `generateMemberSeries(PROFILE, …)`).

- [ ] **Step 7: Run the suite**

Run: `node --test tests/sources.test.js tests/generator.test.js`
Expected: PASS (sources 8, generator 5).

- [ ] **Step 8: Commit**

```bash
git add src/sources.js src/metrics.js src/generator.js tests/sources.test.js tests/generator.test.js
git commit -m "refactor: member data via sources.loadMemberData; drop PROFILES/generateNormalData"
```

---

## Task 4: `evalReport` gains an `evaluable` allow-list

**Files:**
- Modify: `analyst.js` (the root orchestrator), `tests/run.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/run.test.js`, in the eval section)

```js
test('eval: evaluable allow-list excludes non-listed members from false positives', () => {
  const r = rep(['worth_noting', 'worth_noting', 'all_clear']); // Mom, Dad, Sister  (per MEMBERS3)
  const e = evalReport(r, { scenario_family: 'perturbation', target_member: 'Dad', evaluable: ['Dad', 'Sister'] });
  assert.equal(e.detected, true);                 // Dad is target + worth_noting
  assert.deepEqual(e.false_positives, []);        // Mom is NOT evaluable, so not a false positive
});
```
(Note: `MEMBERS3`/`rep` already exist in `tests/run.test.js` as `[Mom, Dad, Sister]`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/run.test.js`
Expected: FAIL — `evaluable` ignored; `false_positives` is `['Mom']`.

- [ ] **Step 3: Update `evalReport` in `analyst.js`**

Replace the existing `evalReport` with:
```js
// Scenario-family-aware scoring. `evaluable` (optional) restricts scoring to that name set
// (used to exclude real members, which have no ground truth). Omitted ⇒ score all members.
export function evalReport(report, { scenario_family, target_member, evaluable }) {
  const expected = scenario_family === 'stale_data' ? 'no_data'
                 : scenario_family === 'perturbation' ? 'worth_noting'
                 : null;
  const names = evaluable ? new Set(evaluable) : null;
  const consider = report.members.filter((m) => !names || names.has(m.name));
  const byName = new Map(consider.map((m) => [m.name, m.status]));
  const detected = target_member != null ? byName.get(target_member) === expected : null;
  const false_positives = consider
    .filter((m) => m.name !== target_member && m.status === 'worth_noting')
    .map((m) => m.name);
  return { detected, false_positives };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/run.test.js`
Expected: PASS (the new test + the existing eval tests, which pass no `evaluable` and are unchanged).

- [ ] **Step 5: Commit**

```bash
git add analyst.js tests/run.test.js
git commit -m "feat: evalReport evaluable allow-list (excludes non-listed members)"
```

---

## Task 5: `run()` becomes config-driven (synthetic only)

**Files:**
- Modify: `analyst.js`, `tests/run.test.js`

- [ ] **Step 1: Update the `run.test.js` `deps()` helper to inject a family**

Add a `family` to `deps()` and stop relying on implicit `PROFILES`. Insert into the returned object in `deps()`:
```js
    family: {
      family: 'Test',
      members: [
        { id: 'm1', name: 'Mom',    source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000,  hrv: 65 } },
        { id: 'm2', name: 'Dad',    source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500,  hrv: 48 } },
        { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
      ],
    },
```
(The fake `llmClient` already returns Mom/Dad/Sister — unchanged.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/run.test.js`
Expected: FAIL — `run()` does not yet read `deps.family` / still references removed `generateNormalData`.

- [ ] **Step 3: Rewrite the member-building portion of `run()` in `analyst.js`**

Replace the imports `generateNormalData` → the reader, and the member/scenario/eval blocks. New imports near the top:
```js
import { loadMemberData, readFamilyFile } from './src/sources.js';
```
Remove `import { generateNormalData } from './src/generator.js';`.

Replace the body of `run()` from the member build through the eval with:
```js
  const {
    today, env = {}, scenario = 'auto', force = false, llmClient,
    family = readFamilyFile(),
    scenarioPool = (client) => generateScenarioPool(client),
    readFeed, sendMessage, write = writeStore, storePath = 'data.json',
  } = deps;

  const dateHash = hashDate(today);
  const seed = dateHash % 100000;

  // 1. Build every member from config (synthetic → generator; feed → Task 8).
  const members = [];
  for (let i = 0; i < family.members.length; i++) {
    members.push(await loadMemberData(family.members[i], { today, days: 30, seed: seed + i * 1000, readFeed }));
  }

  // 2. Clean baselines for everyone, BEFORE any scenario mutates data.
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));

  // 3. Resolve effective scenario (gate unchanged).
  let gate_fired = false;
  let effective = scenario;
  if (scenario === 'auto') { gate_fired = shouldFireScenario(today, { force }); effective = gate_fired ? 'llm' : 'all_normal'; }

  // 4. Scenario targets a SYNTHETIC member only.
  const synthetic = members.filter((m) => !m.real);
  let label = 'all_normal', targetId = null, scenario_pool_size = 0, scenario_pool_valid = 0;
  const targetIdx = synthetic.length ? (dateHash % synthetic.length) : -1;
  const target = targetIdx >= 0 ? synthetic[targetIdx] : null;
  if (effective === 'stale_data' && target) {
    applyStaleData(target, 2); label = 'stale_data'; targetId = target.id;
  } else if (effective === 'llm' && target) {
    const pool = await scenarioPool(llmClient);
    scenario_pool_size = pool.length;
    scenario_pool_valid = pool.filter((s) => validateScenario(s).ok).length;
    const chosen = pickScenario(pool, seed);
    if (chosen) { applyPerturbations(target, chosen.perturbations); label = chosen.label; targetId = target.id; }
    else { label = 'all_normal'; console.warn('scenario pool empty — all_normal'); }
  }
  const targetName = targetId ? target.name : null;

  // 5. Analyst sees only members WITH data today; real no-data members are excluded.
  const prompted = members.filter((m) => m.today != null);
  const t0 = Date.now();
  let report = null;
  try { report = await runAnalyst(llmClient, prompted, baselines); }
  catch (e) { console.error('analyst failed:', e.message); }
  const llm_ms = Date.now() - t0;
  const model = llmClient?.model || env.GEMINI_MODEL || 'gemini-flash';

  // 6. Validate against the PROMPTED member count.
  const report_valid = report ? validateReport(report, prompted).ok : false;
  const messageText = report_valid ? formatReport(report) : 'Daily Health Report unavailable today (technical issue) — data is synthetic, no action needed.';

  // 7. Eval over SYNTHETIC members only.
  const fam = scenarioFamily(label);
  const scenario_applied = label !== 'all_normal';
  const evaluable = synthetic.map((m) => m.name);
  let evalResult = { scenario_applied, scenario_family: fam, target_member: targetName, detected: null, false_positives: [] };
  if (report_valid) {
    const r = evalReport(report, { scenario_family: fam, target_member: targetName, evaluable });
    evalResult.detected = scenario_applied ? r.detected : null;
    evalResult.false_positives = r.false_positives;
  }

  // 8. Telegram.
  let telegram_ok = false;
  try { await sendMessage(messageText); telegram_ok = true; } catch (e) { console.error('telegram send failed:', e.message); }

  // 9. Persist. `simulated` ⇒ "contains any synthetic member".
  const data = {
    generated_at: today.toISOString(),
    simulated: members.some((m) => !m.real),
    scenario: label, scenario_member: targetId,
    members, baselines, report, report_valid, eval: evalResult,
    telemetry: { gate_fired, scenario_pool_size, scenario_pool_valid, llm_ms, model, telegram_ok },
  };
  await write(storePath, data);
  return data;
}
```
(The CLI entry block below `run()` stays, plus the history-archival lines — unchanged. Pass `readFeed` is undefined in the CLI; the default file reader is used in Phase 2.)

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS — all suites green (run.test.js now config-driven; `data.json.members[*].real === false`; eval/scenario behavior identical to before for the 3 synthetic members).

- [ ] **Step 5: Commit**

```bash
git add analyst.js tests/run.test.js
git commit -m "refactor: config-driven run() (members from family.json, synthetic-only scenario/eval)"
```

---

## Task 6: Update `scenarios`/`analyst` tests that used `generateNormalData`

**Files:**
- Modify: `tests/scenarios.test.js`, `tests/analyst.test.js`

- [ ] **Step 1: Replace `generateNormalData` in `tests/scenarios.test.js`**

Change the import and the `fresh()` helper:
```js
import { loadMemberData } from '../src/sources.js';
const SYN = [
  { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
  { id: 'm2', name: 'Dad', source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500, hrv: 48 } },
  { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
];
const fresh = async () => Promise.all(SYN.map((m, i) => loadMemberData(m, { today: TODAY, days: 30, seed: 21 + i * 1000 })));
```
Update the two tests that call `fresh()` to `await fresh()` and index `members[1]`/`members[2]` as before.

- [ ] **Step 2: Replace `generateNormalData` in `tests/analyst.test.js`**

Change the `dataset()` helper:
```js
import { loadMemberData } from '../src/sources.js';
async function dataset() {
  const SYN = [
    { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
    { id: 'm2', name: 'Dad', source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500, hrv: 48 } },
    { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
  ];
  const members = await Promise.all(SYN.map((m, i) => loadMemberData(m, { today: TODAY, days: 30, seed: 31 + i * 1000 })));
  applyPerturbations(members[1], [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -9 } }]);
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));
  return { members, baselines, label: 'poor_recovery' };
}
```
Make the three tests that call `dataset()` `await` it. (`buildMemberContext` etc. are unchanged.)

- [ ] **Step 3: Run the full suite**

Run: `node --test`
Expected: PASS — all green. **Phase 1 complete: config-driven, behavior identical.**

- [ ] **Step 4: Commit**

```bash
git add tests/scenarios.test.js tests/analyst.test.js
git commit -m "test: adapt scenarios/analyst tests to loadMemberData"
```

---

# PHASE 2 — Real feed

## Task 7: `normalizeFeed` (dedupe, future-drop, range-clamp, window)

**Files:**
- Modify: `src/sources.js`, `tests/sources.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/sources.test.js`)

```js
import { normalizeFeed } from '../src/sources.js';
const T = new Date('2026-06-03T12:00:00Z');

test('normalizeFeed builds a trailing window ending at today, today entry resolved', () => {
  const rows = [
    { date: '2026-06-03', rhr: 60, sleep_eff: 90, steps: 8000, hrv: 60 },
    { date: '2026-06-02', rhr: 59, sleep_eff: 88, steps: 7000, hrv: 61 },
  ];
  const { history, today } = normalizeFeed(rows, { today: T, days: 30 });
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
  const { today } = normalizeFeed(rows, { today: T, days: 30 });
  assert.equal(today.rhr, 70);
});

test('normalizeFeed clamps out-of-range / non-numeric metrics to null', () => {
  const rows = [{ date: '2026-06-03', rhr: 9, sleep_eff: 150, steps: 8000, hrv: 'x' }];
  const { today } = normalizeFeed(rows, { today: T, days: 30 });
  assert.equal(today.rhr, null);        // 9 < 30
  assert.equal(today.sleep_eff, null);  // 150 > 100
  assert.equal(today.steps, 8000);      // in range
  assert.equal(today.hrv, null);        // non-numeric
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sources.test.js`
Expected: FAIL — `normalizeFeed` not exported.

- [ ] **Step 3: Add `normalizeFeed` to `src/sources.js`**

```js
function isoDay(today, daysAgo) {
  return new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
}

// Clean a raw feed array into { history:[days], today } aligned to a trailing window ending at today.
// Drops future dates, dedupes by date (last wins), clamps each metric to RANGES (else null).
export function normalizeFeed(rows, { today, days }) {
  const todayStr = isoDay(today, 0);
  const byDate = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.date !== 'string' || r.date > todayStr) continue;
    const day = { date: r.date };
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      const v = r[k];
      day[k] = (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi) ? v : null;
    }
    byDate.set(r.date, day); // last wins
  }
  const history = [];
  for (let i = days; i >= 1; i--) {
    const d = isoDay(today, i);
    history.push(byDate.get(d) || { date: d, rhr: null, sleep_eff: null, steps: null, hrv: null });
  }
  const todayEntry = byDate.get(todayStr) || null;
  const presentDays = [...byDate.keys()].length;
  return { history, today: todayEntry, presentDays };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sources.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources.js tests/sources.test.js
git commit -m "feat: normalizeFeed (dedupe, future-drop, range-clamp, trailing window)"
```

---

## Task 8: `loadMemberData` feed branch + `feed_state` + default file reader

**Files:**
- Modify: `src/sources.js`, `tests/sources.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/sources.test.js`)

```js
const FEED = { id: 'me', name: 'Me', source: 'feed' };
const fullFeed = (today) => Array.from({ length: 20 }, (_, i) => ({
  date: new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10),
  rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65,
}));

test('feed member with fresh full feed → real:true, feed_state ok, today set', async () => {
  const mem = await loadMemberData(FEED, { today: T, days: 30, readFeed: async () => fullFeed(T) });
  assert.equal(mem.real, true);
  assert.equal(mem.feed_state, 'ok');
  assert.equal(mem.today.date, '2026-06-03');
});

test('feed member with too few days → never_synced, today null', async () => {
  const rows = fullFeed(T).slice(0, 3);
  const mem = await loadMemberData(FEED, { today: T, days: 30, readFeed: async () => rows });
  assert.equal(mem.feed_state, 'never_synced');
  assert.equal(mem.today, null);
});

test('feed member with data but missing today → stale, today null', async () => {
  const rows = fullFeed(new Date(T.getTime() - 3 * 86400000)); // newest is 3 days ago
  const mem = await loadMemberData(FEED, { today: T, days: 30, readFeed: async () => rows });
  assert.equal(mem.feed_state, 'stale');
  assert.equal(mem.today, null);
});

test('feed member whose readFeed throws → error state, today null, real:true', async () => {
  const mem = await loadMemberData(FEED, { today: T, days: 30, readFeed: async () => { throw new Error('nope'); } });
  assert.equal(mem.feed_state, 'error');
  assert.equal(mem.today, null);
  assert.equal(mem.real, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sources.test.js`
Expected: FAIL — feed branch throws "not implemented".

- [ ] **Step 3: Implement the feed branch + default reader in `src/sources.js`**

Add the default reader import + replace the feed branch in `loadMemberData`:
```js
import { readFile } from 'node:fs/promises';

export async function readFeedFile(member) {
  return JSON.parse(await readFile(`feeds/${member.id}.json`, 'utf8'));
}
```
Replace the `// 'feed' branch …` throw with:
```js
  // feed source
  const read = readFeed || readFeedFile;
  let rows;
  try { rows = await read(member); }
  catch { return { id: member.id, name: member.name, real: true, history: emptyWindow(today, days), today: null, feed_state: 'error' }; }
  const { history, today: todayEntry, presentDays } = normalizeFeed(rows, { today, days });
  let feed_state;
  if (presentDays < MIN_DAYS) feed_state = 'never_synced';
  else if (!todayEntry) feed_state = 'stale';
  else feed_state = 'ok';
  return { id: member.id, name: member.name, real: true, history, today: feed_state === 'ok' ? todayEntry : null, feed_state };
```
Add the helper near `isoDay`:
```js
function emptyWindow(today, days) {
  const out = [];
  for (let i = days; i >= 1; i--) out.push({ date: isoDay(today, i), rhr: null, sleep_eff: null, steps: null, hrv: null });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sources.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources.js tests/sources.test.js
git commit -m "feat: loadMemberData feed branch + feed_state (ok/stale/never_synced/error)"
```

---

## Task 9: Wire feed members into `run()` + add "Me" + `feeds/`

**Files:**
- Modify: `family.json`, `analyst.js` (CLI passes default reader), `tests/run.test.js`
- Create: `feeds/.gitkeep`

- [ ] **Step 1: Write the failing test** (append to `tests/run.test.js`)

```js
test('mixed family: real member flows through; scenarios/eval stay synthetic-only', async () => {
  const fullFeed = Array.from({ length: 20 }, (_, i) => ({
    date: new Date(TODAY.getTime() - i * 86400000).toISOString().slice(0, 10),
    rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65,
  }));
  const d = deps({
    scenario: 'llm',
    readFeed: async () => fullFeed,
    family: { family: 'T', members: [
      { id: 'm1', name: 'Mom', source: 'synthetic', means: { rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 } },
      { id: 'm2', name: 'Dad', source: 'synthetic', means: { rhr: 62, sleep_eff: 86, steps: 6500, hrv: 48 } },
      { id: 'm3', name: 'Sister', source: 'synthetic', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
      { id: 'me', name: 'Me', source: 'feed' },
    ] },
    // analyst must return a report for the 4 prompted members (Mom/Dad/Sister/Me)
    llmClient: { _prompt: null, async generateJson(p) { this._prompt = p; return { date: '2026-06-03', headline: 'h', members:
      ['Mom','Dad','Sister','Me'].map((n) => ({ name: n, status: n === 'Me' ? 'worth_noting' : 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' })) }; } },
  });
  const data = await run(d);
  const me = data.members.find((m) => m.id === 'me');
  assert.equal(me.real, true);
  assert.equal(me.feed_state, 'ok');
  assert.notEqual(data.scenario_member, 'me');     // never targets the real member
  assert.deepEqual(data.eval.false_positives, []); // Me's worth_noting is NOT a false positive (excluded)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/run.test.js`
Expected: FAIL — feed member currently errors (no `readFeed` wired through to default) OR Me counted in eval.

(With Task 5 + Task 8 already done, `run()` passes `readFeed` through and filters synthetic for scenario/eval, so this test should largely pass; if it fails, the gap is `readFeed` not being threaded — verify `run()` destructures `readFeed` from deps and forwards it to `loadMemberData`, which Task 5 Step 3 already does.)

- [ ] **Step 3: Add "Me" to `family.json` and create `feeds/`**

Append to `family.json` members:
```json
    ,{ "id": "me", "name": "Me", "source": "feed" }
```
Create `feeds/.gitkeep` (empty file). The CLI reader default is `readFeedFile` (already the default in `loadMemberData`).

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS. (Note: a real CLI run with `feeds/me.json` absent will show `me` as `never_synced` — graceful.)

- [ ] **Step 5: Commit**

```bash
git add family.json feeds/.gitkeep tests/run.test.js
git commit -m "feat: wire feed members into run() + add Me + feeds/ dir"
```

---

## Task 10: `check-feed` validator + script

**Files:**
- Create: `src/check-feed.js`, `tests/check-feed.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/check-feed.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/check-feed.js`**

```js
// src/check-feed.js
import { readFile } from 'node:fs/promises';
import { MIN_DAYS, FRESHNESS_DAYS, RANGES } from './sources.js';

// Pure validation of a raw feed array. Returns { ok, reason }.
export function validateFeed(rows, { today }) {
  if (!Array.isArray(rows)) return { ok: false, reason: 'feed is not a JSON array' };
  const todayStr = today.toISOString().slice(0, 10);
  const dates = new Set();
  for (const r of rows) {
    if (!r || typeof r.date !== 'string') return { ok: false, reason: 'an entry is missing a string date' };
    dates.add(r.date);
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      const v = r[k];
      if (v == null) continue; // null allowed
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
        return { ok: false, reason: `${r.date}: ${k}=${JSON.stringify(v)} out of range [${lo},${hi}]` };
      }
    }
  }
  if (dates.size < MIN_DAYS) return { ok: false, reason: `only ${dates.size} days (need >= ${MIN_DAYS})` };
  const newest = [...dates].sort().at(-1);
  const ageDays = Math.round((Date.parse(todayStr) - Date.parse(newest)) / 86400000);
  if (ageDays > FRESHNESS_DAYS) return { ok: false, reason: `newest entry ${newest} is ${ageDays} days old (> ${FRESHNESS_DAYS})` };
  return { ok: true };
}

// CLI: node src/check-feed.js <id>
if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (!id) { console.error('usage: npm run check-feed -- <id>'); process.exit(2); }
  const rows = JSON.parse(await readFile(`feeds/${id}.json`, 'utf8')).catch?.(() => null) ?? JSON.parse(await readFile(`feeds/${id}.json`, 'utf8'));
  const res = validateFeed(rows, { today: new Date() });
  if (res.ok) { console.log(`✓ feeds/${id}.json looks good`); process.exit(0); }
  console.error(`✗ feeds/${id}.json: ${res.reason}`); process.exit(1);
}
```
(Note: simplify the CLI read to a plain try/catch — see Step 4 if the inline read is awkward.)

- [ ] **Step 4: Simplify the CLI read block** (replace the messy line)

```js
if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (!id) { console.error('usage: npm run check-feed -- <id>'); process.exit(2); }
  let rows;
  try { rows = JSON.parse(await readFile(`feeds/${id}.json`, 'utf8')); }
  catch (e) { console.error(`✗ cannot read feeds/${id}.json: ${e.message}`); process.exit(1); }
  const res = validateFeed(rows, { today: new Date() });
  if (res.ok) { console.log(`✓ feeds/${id}.json looks good`); process.exit(0); }
  console.error(`✗ feeds/${id}.json: ${res.reason}`); process.exit(1);
}
```

- [ ] **Step 5: Add the script to `package.json`**

In `"scripts"`, add:
```json
    "check-feed": "node src/check-feed.js",
```

- [ ] **Step 6: Run tests + a manual CLI check**

Run: `node --test tests/check-feed.test.js`
Expected: PASS (5 tests).
Run: `npm run check-feed -- nope` → prints `✗ cannot read feeds/nope.json…`, exit 1.

- [ ] **Step 7: Commit**

```bash
git add src/check-feed.js tests/check-feed.test.js package.json
git commit -m "feat: check-feed validator + npm script"
```

---

## Task 11: Telegram disclosure conditional on `simulated`

**Files:**
- Modify: `src/telegram.js`, `tests/telegram.test.js`, `analyst.js`

- [ ] **Step 1: Write the failing test** (append to `tests/telegram.test.js`)

```js
test('formatReport omits the synthetic disclosure when simulated:false', () => {
  const text = formatReport(report, { simulated: false });
  assert.ok(!/simulated|synthetic/i.test(text.split('\n')[0]), 'no disclosure when all-real');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/telegram.test.js`
Expected: FAIL — `formatReport` ignores the option, still prepends the disclosure.

- [ ] **Step 3: Update `formatReport` in `src/telegram.js`**

Change the signature + the disclosure push:
```js
export function formatReport(report, { simulated = true } = {}) {
  const lines = [];
  if (simulated) lines.push('Synthetic demo data — not real health measurements; no action needed.');
  if (simulated) lines.push('');
  lines.push(report.headline);
  // …rest unchanged…
```

- [ ] **Step 4: Pass `simulated` from `run()` in `analyst.js`**

In `run()` step 6, change the message build:
```js
  const messageText = report_valid
    ? formatReport(report, { simulated: members.some((m) => !m.real) })
    : 'Daily Health Report unavailable today (technical issue) — data is synthetic, no action needed.';
```

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS — existing telegram tests still pass (default `simulated:true`), plus the new one.

- [ ] **Step 6: Commit**

```bash
git add src/telegram.js tests/telegram.test.js analyst.js
git commit -m "feat: Telegram disclosure only when simulated"
```

---

## Task 12: Dashboard real/demo label + feed_state copy

**Files:**
- Modify: `index.html` (no automated test — manual verification)

- [ ] **Step 1: Add a legend + per-card tag + feed_state copy**

In the `render()` function of `index.html`:

(a) After setting `legend`, append the real/demo legend:
```js
  document.getElementById('legend').textContent =
    'Each dot reflects how that day compares to the person’s own normal range: ○ normal, ▲ worth a look.  ·  ● real = live data, demo = simulated.';
```

(b) Replace the card-header construction so it shows the tag + feed_state sub-line. Find the `card.innerHTML = ...` block and change the `<h3>` + `sub` to:
```js
    const tag = mem.real ? '<span class="tier" style="color:var(--green)">● real</span>' : '<span class="tier">demo</span>';
    const stateCopy = {
      ok: '', stale: `last synced ${gap} day${gap === 1 ? '' : 's'} ago`,
      never_synced: 'not synced yet', error: 'feed unavailable',
    };
    const sub = (mem.real && mem.feed_state && mem.feed_state !== 'ok')
      ? `<p class="sub">${stateCopy[mem.feed_state] || ''}</p>`
      : (mem.today ? '' : `<p class="sub">last synced ${gap} day${gap === 1 ? '' : 's'} ago</p>`);
    card.innerHTML = `<h3>${mem.name} ${tag}</h3>${sub}
      ${rows}<div class="chart-grid">${METRICS.map((m) => `<canvas id="c-${mem.id}-${m}" height="120" aria-label="${mem.name} ${META[m].label} 30-day trend"></canvas>`).join('')}</div>`;
```

(c) The banner already keys off `data.simulated` — leave as-is (now means "has synthetic").

- [ ] **Step 2: Manual verify**

Seed a quick mixed `data.json` (or run the pipeline), then `npm run serve` → http://localhost:8080. Confirm: synthetic cards show `demo`, a feed member shows `● real`; a `never_synced` member shows "not synced yet" (distinct from "last synced N days ago").

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: dashboard real/demo tag + feed_state copy + legend"
```

---

## Task 13: `docs/ONBOARDING.md` (Route B guide)

**Files:**
- Create: `docs/ONBOARDING.md`

- [ ] **Step 1: Write `docs/ONBOARDING.md`** with these sections (full prose — no placeholders):

1. **Read this first (privacy):** real metrics + 30-day history go to a **public** repo and to Gemini, irreversibly; only do this for *your own* data; don't onboard others' real data here (needs consent + a private repo).
2. **Create the GitHub token:** github.com → Settings → Developer settings → fine-grained PAT → **Only select repositories: this repo** → Repository permissions → **Contents: Read and write** → short expiry → copy. Note: it can write any file in the repo; revoke if exposed.
3. **The feed contract:** `feeds/me.json` = `[{date,rhr,sleep_eff,steps,hrv}, …]`, newest-or-oldest fine, any metric may be `null`. `sleep_eff = Σ asleep ÷ Σ in-bed × 100` per night; if not reliably computable, emit `null`.
4. **The Shortcut (operator-assembled):** the actions, in order — Find Health Samples (RHR/HRV/Steps/Sleep, last 30 days) → compute per-day values + `sleep_eff` → build the JSON text → Base64-encode → **GET** `https://api.github.com/repos/<owner>/<repo>/contents/feeds/me.json` (header `Authorization: Bearer <PAT>`, `Accept: application/vnd.github+json`) → read `sha` from the response (on 404, omit `sha`) → **PUT** the same URL with body `{ "message":"feed", "content":"<base64>", "sha":"<sha or omitted>" }`. **Why two requests:** the PUT needs the current file `sha` or it 422s; re-GET every run. One device per person (avoids 409).
5. **Automation:** Shortcuts → Automation → Time of Day 7:00 AM daily → run the Shortcut; turn **Ask Before Running** off.
6. **Register + verify:** add `{ "id":"me","name":"Me","source":"feed" }` to `family.json` (already present); after the first successful run, `npm run check-feed -- me` → expect `✓`.
7. **Troubleshooting:** `422` = stale/missing sha (re-GET); `404` on first PUT = expected (omit sha); `401/403` = PAT scope/expiry; card shows "not synced yet" = no valid feed committed yet; first-run debugging is manual.

- [ ] **Step 2: Commit**

```bash
git add docs/ONBOARDING.md
git commit -m "docs: Route B onboarding guide (PAT, Shortcut GET-sha→PUT, automation)"
```

---

## Verification (end-to-end)

1. `node --test` → all suites green (existing + `sources`, `check-feed`, mixed-member `run` tests).
2. Hand-write a `feeds/me.json` (≥7 recent days) → `npm run check-feed -- me` → `✓`.
3. `SCENARIO=all_normal node --env-file=.env analyst.js` → `data.json` has `me` with `real:true`,
   `feed_state:"ok"`; `npm run serve` → "Me" card shows `● real`; Mom/Dad/Sister show `demo`.
4. Delete `feeds/me.json` → re-run → "Me" shows `not synced yet`, pipeline still succeeds.
5. Confirm `data.json.scenario_member` is never `me` across several seeds, and a `worth_noting` on
   `me` never appears in `eval.false_positives`.

## Notes for the implementer
- **Phase 1 (Tasks 1–6) must keep `node --test` green** with identical behavior for the 3 synthetic
  members — it is a pure refactor. Do not start Phase 2 until Phase 1 is green.
- The prebuilt `.shortcut` file cannot be generated from code; the operator builds it once from
  `docs/ONBOARDING.md` and may share an iCloud link. The guide is the deliverable here.
- Real data on a public repo is the operator's explicit, eyes-open choice (spec Privacy section).
