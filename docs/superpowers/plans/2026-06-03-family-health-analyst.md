# Family Health Analyst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo where an LLM "analyst" reads synthetic family wearable data, writes a baseline-aware daily report pushed to Telegram, and a static dashboard drills into the same data and baselines.

**Positioning (primary audience = family daily-glance tool):** The core promise is a **low-noise morning health signal the family trusts** — "most mornings it just says everyone's steady; when several of someone's signals move together, it gives you a gentle heads-up." Quiet days must be *structurally* quiet, and a flagged member must be rare, or recipients stop reading. The hidden-scenario/answer-key mechanism is a *correctness-proof and demo affordance*, secondary to the daily-glance experience. The synthetic-data harness is real and runs daily; swapping in a real reader (Task 15) is the explicit graduation path. See **Review Revisions** below — those directives override the task bodies where they conflict.

**Architecture:** A Node 22 (ESM) pipeline generates ~30 days of correlated synthetic health data, applies one scenario to one member (everyone else stays normal), computes per-member baselines **once**, and feeds today's numbers + baselines (but **never** the scenario label) to Gemini for a structured report. The orchestrator writes `data.json` (members + baselines + report + operator-only scenario label) and pushes the report to Telegram. A single self-contained `index.html` reads `data.json` and renders cards + 30-day trend charts with baseline bands. GitHub Actions runs it daily and commits `data.json` back; GitHub Pages serves the dashboard.

**Tech Stack:** Node 22 LTS, ES modules, `node:test` (built-in test runner, no test deps), `@google/genai` for Gemini, native `fetch` for Telegram, JSON file store, vanilla `index.html` + Chart.js (CDN), GitHub Actions + Pages.

---

## Review Revisions — 2026-06-03 (multi-angle review, family-primary)

> These directives are the result of a 6-lens review (tech / ux / data / qa / marketing / sales).
> **They override the task bodies below where they conflict.** Apply each as part of the named task.
> Contradictions surfaced by the review are resolved here per the **family daily-glance** primary audience.

### Critical (do before first real run)

1. **Make the Telegram send un-crashable — Task 10.** `formatReport` interpolates LLM-authored free text into a `parse_mode:'Markdown'` payload; stray `_ * [ ] \`` produce an HTTP 400 that throws *after* `data.json` is written, so the family gets nothing while CI stays green. **Resolution (family-primary): send plain text — drop `parse_mode` entirely** (a reliable message beats a bold headline). Add a `formatReport`/`sendTelegram` test feeding a summary containing `_ * [ \`` and assert the payload is delivered safely. As defense-in-depth, on any non-ok Telegram response retry once as plain text and surface the API `description` field in the thrown error.

2. **Validate the real Gemini output — Task 9 + Task 11.** Every analyst test uses a perfectly-shaped fake. Add `validateReport(report, members)` (own tests: missing required fields, `status` not in enum, member-name mismatch, member count ≠ 3, `changed_signals` not an array). Call it in `run()` **after** `runAnalyst`, **before** write/send; on failure fall back to a safe "report unavailable today (technical issue) — data is synthetic, no action needed" Telegram message rather than throwing. Add an analyst test feeding a malformed fake response asserting the guard catches it.

3. **Measure detection (SCENARIO-FAMILY-AWARE) — Task 9/11.** The store holds the answer key (`scenario`, `scenario_member`) and the analyst emits per-member status, but nothing compares them. The eval MUST be scenario-family-aware, because the *correct* target status differs by family: a perturbation scenario's correct status is `worth_noting`, but a `stale_data` scenario's correct status is `no_data` (scoring it against `worth_noting` would mis-score a correct detection as a miss). Define `scenarioFamily(label)` → `'perturbation' | 'stale_data' | 'all_normal'` and `evalReport(report, { scenario_family, target_member })` that computes:
   - **detected** (true positive): for `perturbation`, target member `status === 'worth_noting'`; for `stale_data`, target member `status === 'no_data'`; for `all_normal`, `detected = null` (no scenario applied, nothing to detect).
   - **false_positives**: any NON-target member with `status === 'worth_noting'`. A `no_data` is NOT a false positive (a member legitimately didn't sync). On `all_normal`, every member must be `all_clear` with zero `worth_noting`; any `worth_noting` is a false positive.
   Run it in `run()`, store `eval:{ scenario_applied, scenario_family, target_member, detected, false_positives }`. Add offline tests with canned fake reports per family (including a `stale_data` report whose target is `no_data` asserting `detected===true`, NOT a miss).

4. **Dashboard error/empty/day-zero states — Task 12.** Top-level `await fetch('data.json')` has no `try/catch` / `res.ok` guard; a missing or mid-rewrite `data.json` leaves the page stuck on "Loading…" forever. Wrap fetch + render in `try/catch`, guard `res.ok`, and on failure replace `#report` with a friendly message ("Couldn't load today's data — the daily report may not have run yet. Try again later.").

5. **Cadence contract = quiet by default — Task 11 + Task 13.** A fresh seeded scenario *every* morning is textbook cry-wolf. **Resolution (family-primary):** add a PURE function `shouldFireScenario(date, { force }) -> boolean` driven by a hash of the UTC report-date so it is deterministic per date. When it returns false the effective scenario is `all_normal` and NO member is perturbed; the feed is visibly calm. `force:true` (set by `workflow_dispatch`) always fires. An explicit operator `SCENARIO`/env value bypasses the gate entirely (so demos still work). Verifiability replaces the un-checkable "~10–15%": add a 365-date iteration test asserting the fired fraction falls in an explicit band (**8–18%**), that the result is deterministic per date, that `force:true` always fires, and that a gate-false day yields `all_normal` with no perturbation applied. Document this "quiet most mornings" rhythm as the core promise.

6. **Onboarding wall — Task 13 README + Task 0 `.env.example`.** Add a numbered "Get your Telegram chat id" subsection (BotFather create → message the bot → `https://api.telegram.org/bot<TOKEN>/getUpdates` → copy `chat.id`; note groups use a negative id) and a line "Pages requires a public repo (or GitHub Pro for private)." Add an `npm run telegram:test` script that sends "Setup works!" so the operator gets a green light before trusting the daily job.

### Major (close before relying on it)

7. **Harden CI/deploy — Task 13.** Add a push/PR workflow (or a step) running `npm ci && node --test` **before** `node analyst.js` so a regression can't deploy green. Add `concurrency:{ group: daily-analyst, cancel-in-progress: false }` and `git pull --rebase --autostash origin main` before push. Narrow the `|| echo 'no changes'` guard so it only swallows the empty-diff case, not real failures. Make the commit step `if: success()`.

8. **Fix the cherry-picked-seed test + validate correlation — Task 4.** Replace "pick a seed where `|z|<3` passes and keep it" with a **statistical** assertion: loop many deterministic seeds and assert the fraction of `|z|>=3` metric-values stays below the expected tail (~1–2%) — or assert `mean |z| < 1` / use a longer baseline. Separately, add a generator test building a long series and asserting the intended lag-1 sign+magnitude of sleep→next-day RHR (negative) and HRV (positive) — the multi-signal story is currently asserted only by construction.

9. **Pin the SDK + parse defensively — Task 6/9.** Pin `@google/genai` to an exact tested version; in `generateJson` strip a leading/trailing code fence and retry once before `JSON.parse`; add one opt-in live smoke test (skipped without `GEMINI_API_KEY`) asserting a real call returns `ANALYST_SCHEMA`-valid JSON.

10. **Single status encoding + accessibility — Task 12 (+ Task 10 ICON map).** The card z-threshold dots are a *second* "how concerned" system that can show red under an amber `worth_noting` member. **Derive the card indicator from the analyst's per-member status** (single source of truth) or add a legend. Pair every status with a **non-color** cue (tier word/glyph + `aria-label`); verify amber/grey meet WCAG AA on the dark card background. Set chart `spanGaps:false` so no-sync gaps render as breaks, and add "last synced N days ago" on no-sync cards. Give the flagged member's card a status badge/left-border and sort flagged members first.

11. **Plain-language family copy — Task 9/10/12.** Keep σ/z-scores as an operator/dashboard detail; **translate `changed_signals` to plain language in Telegram** ("resting heart rate noticeably higher than usual"). Lead the README and Telegram header with the value sentence (#5 above) and the blind-inference hook ("the analyst sees only each person's own numbers and personal baseline — never the scenario"). Make the synthetic-data disclosure the **first line** of the Telegram message and a high-contrast persistent dashboard banner (it currently trails a "see a doctor" suggestion as a footnote).

12. **Resilience + instrumentation — Task 11/10.** Wrap `run()` so analyst/LLM/Telegram failures still notify (plain text) rather than dying silently in CI. Persist lightweight telemetry to the store/stdout: `scenario_pool_size`, `scenario_pool_valid`, `llm_ms` per call, model used, `telegram_ok`. **Log the silent "pool empty ⇒ all_normal" fallback explicitly.**

### Contradiction resolutions (decided per family-primary)

- **Telegram format:** plain text (reliability > bold), not MarkdownV2. (#1)
- **Daily cadence:** rare, structurally-quiet scenarios (~10–15% of days), not date-drift-for-liveliness. (#5)
- **Answer key:** gate the operator scenario label behind `?operator=1` in the dashboard and keep it out of the casual family view (it currently prints in the public footer, line ~1550). Surface the answer-key narrative only in the README/demo script.
- **σ exposure:** out of the family-facing Telegram message; retained on the dashboard/operator detail and for `aria-label`s. (#11)

### Deferred (none — all six lens clusters were accepted)

The 18 minor findings (timezone off-by-one, Chart.js fill fragility, expected-test-count mismatches, naming/tone, baseline min-sample guard, etc.) are not transcribed here; revisit after the above land. Full report archived from the review run.

---

## Data Contracts (single source of truth — keep these exact across all tasks)

**Metric keys (exact):** `rhr`, `sleep_eff`, `steps`, `hrv`.

**Day entry** — one synced day. A *missing* day keeps its `date` but has `null` metrics:
```js
{ date: '2026-06-03', rhr: 58.2, sleep_eff: 90.1, steps: 9034, hrv: 64.7 }
```

**Member:**
```js
{
  id: 'm1',
  name: 'Alex',
  history: [ /* ~30 oldest→newest day entries, NOT incl. today */ ],
  today:   { /* day entry */ } | null   // null = not synced today
}
```

**Baseline (per member, per metric):**
```js
{ rhr: { mean: 58.1, std: 2.0 }, sleep_eff: {…}, steps: {…}, hrv: {…} }
```

**Store (`data.json`) — what the orchestrator writes and the dashboard reads:**
```js
{
  generated_at: '2026-06-03T23:00:00.000Z',
  simulated: true,
  scenario: 'poor_recovery',      // OPERATOR-ONLY hidden label. Never enters the analyst prompt.
  scenario_member: 'm2',          // operator-only: which member the scenario targets
  members: [ /* Member[] */ ],
  baselines: { m1: <Baseline>, m2: <Baseline>, m3: <Baseline> },  // computed ONCE (from CLEAN data), consumed by analyst + dashboard
  report: <AnalystReport>,         // null if the LLM call failed / output was invalid
  report_valid: true,              // false ⇒ fallback message sent; dashboard should show the unavailable state
  eval: {                          // operator-only: scenario-family-aware scoring vs the answer key
    scenario_applied: true, scenario_family: 'perturbation', target_member: 'Sam',
    detected: true,                // null when no scenario was applied (all_normal / gated quiet day)
    false_positives: []            // names of NON-target members flagged worth_noting
  },
  telemetry: {                     // operator-only instrumentation
    gate_fired: true, scenario_pool_size: 3, scenario_pool_valid: 2,
    llm_ms: 1240, model: 'gemini-2.0-flash', telegram_ok: true
  }
}
```

**AnalystReport (LLM structured output):**
```js
{
  date: '2026-06-03',
  headline: 'Three steady, one worth a check-in.',
  members: [
    {
      name: 'Sam',
      status: 'worth_noting',          // 'all_clear' | 'worth_noting' | 'no_data'
      summary: 'Resting HR up and HRV/sleep down together — looks like poor recovery.',
      changed_signals: ['rhr +2.4σ', 'hrv -1.9σ', 'sleep_eff -1.6σ'],
      suggestion: 'Worth an easy day; mention to a doctor if it persists.' // nullable
    }
  ]
}
```

**INFORMATION BARRIER (non-negotiable):** `scenario` / `scenario_member` live ONLY at the top level of the store. They are never copied into `members`, never passed to `buildPrompt`, and a test asserts the analyst prompt string does not contain the label.

**CONSISTENCY RULE:** `baselines` is computed in `src/baseline.js`, written to `data.json` once, and read by BOTH the analyst (via the orchestrator) and the dashboard. The dashboard never recomputes baselines.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | ESM project, deps (`@google/genai`), scripts (`test`, `start`, `serve`), `engines.node >=22` |
| `.gitignore` | `node_modules`, `.env` |
| `.env.example` | documents `GEMINI_API_KEY`, `GEMINI_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SCENARIO`, `SEED` |
| `src/metrics.js` | metric keys, per-metric metadata, person profiles, noise, `roundMetric()` |
| `src/random.js` | seeded RNG (`makeRng`) + `gaussian()` — deterministic for tests |
| `src/baseline.js` | `mean`, `std`, `computeBaseline`, `zScore` — SHARED baseline logic |
| `src/generator.js` | `generateMemberSeries`, `generateNormalData` — correlated synthetic data |
| `src/scenarios.js` | `FIXED_SCENARIOS`, `applyPerturbations`, `applyStaleData`, `validateScenario` |
| `src/scenarioGenerator.js` | LLM-driven open-ended scenario pool (Gemini), validated, non-emergency |
| `src/llm.js` | Gemini client wrapper, env/config driven, `generateJson(prompt, schema)` |
| `src/analyst.js` | recent-window + per-member context builder, prompt, schema, `runAnalyst` |
| `src/telegram.js` | `formatReport`, `sendTelegram` (fetch-based, injectable) |
| `src/store.js` | `readStore`, `writeStore` |
| `analyst.js` (root) | **entrypoint** the workflow runs: wire generate→scenario→baseline→analyst→telegram→write |
| `index.html` | self-contained dashboard: report + cards + trend charts w/ baseline band |
| `.github/workflows/daily.yml` | scheduled + manual job that runs `node analyst.js` and commits `data.json` |
| `tests/*.test.js` | `node:test` suites per module |
| `README.md` | run/demo instructions |

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "family-health-analyst",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test",
    "start": "node analyst.js",
    "telegram:test": "node --env-file=.env -e \"import('./src/telegram.js').then(({sendTelegram,getTelegramConfig})=>sendTelegram('Setup works!',getTelegramConfig()).then(()=>console.log('sent')).catch(e=>{console.error(e.message);process.exit(1)}))\"",
    "serve": "node --watch-path=. -e \"import('node:http').then(({default:h})=>import('node:fs').then(({default:f})=>h.createServer((q,s)=>{const p=q.url==='/'?'/index.html':q.url;f.readFile('.'+p,(e,d)=>e?(s.statusCode=404,s.end()):s.end(d))}).listen(8080,()=>console.log('http://localhost:8080'))))\""
  },
  "dependencies": {
    "@google/genai": "1.7.0"
  }
}
```

> **Pinned version:** `@google/genai` is pinned to an EXACT version (`1.7.0`) rather than `^1.0.0` so the structured-output (`responseSchema`) behavior the analyst relies on cannot drift under us. `1.7.0` is the tested version for this plan; if the implementer verifies a newer 1.x at build time they may bump it, but they must re-run the analyst/scenario tests (and confirm `nullable` schema support — see Task 9) before changing it. **Left for the human:** confirm `1.7.0` is installable/recent at execution time; if not, pick a concrete recent `1.x.y`, pin it exactly, and note it as the tested version.

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 3: Create `.env.example`**

```
# Gemini (https://aistudio.google.com/apikey) — free tier, no card required
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Telegram bot (BotFather) + your chat id.
# To get TELEGRAM_CHAT_ID: create a bot via @BotFather, send your bot any message,
# then open https://api.telegram.org/bot<TOKEN>/getUpdates and copy result[].message.chat.id.
# Group chats use a NEGATIVE id (e.g. -1001234567890). See README "Get your Telegram chat id".
# After filling these in, run `npm run telegram:test` — it should send "Setup works!".
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Cadence control. 'auto' = quiet-by-default gate (~13% of days fire a scenario) — the production
# default. Set to 'all_normal' | 'stale_data' | 'llm' to force a specific scenario (bypasses the
# gate). FORCE_SCENARIO=1 forces the gate to fire on an 'auto' day (used by workflow_dispatch).
# (The daily seed + flagged member are derived from the UTC date — there is no SEED knob.)
SCENARIO=auto
FORCE_SCENARIO=
```

- [ ] **Step 4: Install deps and verify the test runner works**

Run: `npm install && node --test`
Expected: install succeeds; `node --test` reports `tests 0` (no tests yet) and exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "chore: scaffold project (ESM, node:test, @google/genai)"
```

---

## Task 1: Seeded RNG (`src/random.js`)

Deterministic randomness so generator output is reproducible and testable.

**Files:**
- Create: `src/random.js`
- Test: `tests/random.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/random.test.js`
Expected: FAIL — cannot find module `../src/random.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/random.js

// mulberry32 — small, fast, deterministic PRNG. Returns a function giving [0,1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller transform, driven by an rng() so it stays deterministic.
export function gaussian(rng, mean = 0, std = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/random.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/random.js tests/random.test.js
git commit -m "feat: seeded RNG and gaussian for reproducible synthetic data"
```

---

## Task 2: Metric schema (`src/metrics.js`)

The one place that defines metric keys, person profiles, noise, and rounding. Everything imports from here so signals never drift.

**Files:**
- Create: `src/metrics.js`
- Test: `tests/metrics.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/metrics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, METRIC_META, PROFILES, NOISE, roundMetric } from '../src/metrics.js';

test('four canonical metrics in fixed order', () => {
  assert.deepEqual(METRICS, ['rhr', 'sleep_eff', 'steps', 'hrv']);
});

test('every metric has metadata and noise', () => {
  for (const m of METRICS) {
    assert.ok(METRIC_META[m].label, `no label for ${m}`);
    assert.ok(['lower', 'higher'].includes(METRIC_META[m].better));
    assert.equal(typeof NOISE[m], 'number');
  }
});

test('three profiles, each with a mean per metric', () => {
  assert.equal(PROFILES.length, 3);
  for (const p of PROFILES) {
    assert.ok(p.id && p.name);
    for (const m of METRICS) assert.equal(typeof p.means[m], 'number');
  }
});

test('roundMetric clamps and rounds per metric', () => {
  assert.equal(roundMetric('steps', 9003.7), 9004);
  assert.equal(roundMetric('steps', -5), 0);
  assert.equal(roundMetric('sleep_eff', 105), 100);
  assert.equal(roundMetric('rhr', 58.27), 58.3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/metrics.test.js`
Expected: FAIL — cannot find module `../src/metrics.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/metrics.js

export const METRICS = ['rhr', 'sleep_eff', 'steps', 'hrv'];

export const METRIC_META = {
  rhr:       { label: 'Resting HR',       unit: 'bpm',   better: 'lower'  },
  sleep_eff: { label: 'Sleep efficiency', unit: '%',     better: 'higher' },
  steps:     { label: 'Steps',            unit: 'steps', better: 'higher' },
  hrv:       { label: 'HRV',              unit: 'ms',    better: 'higher' },
};

// Distinct, realistic per-person baselines. The generator wobbles around these.
export const PROFILES = [
  { id: 'm1', name: 'Alex',  means: { rhr: 58, sleep_eff: 90, steps: 9000,  hrv: 65 } },
  { id: 'm2', name: 'Sam',   means: { rhr: 62, sleep_eff: 86, steps: 6500,  hrv: 48 } },
  { id: 'm3', name: 'Priya', means: { rhr: 66, sleep_eff: 88, steps: 11000, hrv: 55 } },
];

// Daily wobble (std) per metric — small, so anomalies stand out.
export const NOISE = { rhr: 2.0, sleep_eff: 2.5, steps: 1500, hrv: 5.0 };

export function roundMetric(metric, v) {
  if (metric === 'steps') return Math.max(0, Math.round(v));
  if (metric === 'sleep_eff') return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
  return Math.round(v * 10) / 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/metrics.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat: metric schema, person profiles, noise, rounding"
```

---

## Task 3: Shared baseline computation (`src/baseline.js`)

The single source of truth for baselines and z-scores. Built before the generator so the generator's realism can be checked against it.

**Files:**
- Create: `src/baseline.js`
- Test: `tests/baseline.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/baseline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, std, computeBaseline, zScore } from '../src/baseline.js';

test('mean and std of a known set', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(Math.abs(std([2, 4, 6]) - 2) < 1e-9); // sample std
});

test('computeBaseline returns mean+std per metric and ignores null days', () => {
  const history = [
    { date: 'd1', rhr: 58, sleep_eff: 90, steps: 9000, hrv: 65 },
    { date: 'd2', rhr: 60, sleep_eff: 88, steps: 9500, hrv: 63 },
    { date: 'd3', rhr: null, sleep_eff: null, steps: null, hrv: null }, // missing day skipped
  ];
  const b = computeBaseline(history);
  assert.equal(b.rhr.mean, 59);
  assert.ok(b.rhr.std > 0);
  assert.ok(b.sleep_eff.mean === 89);
});

test('zScore handles zero std and nulls', () => {
  assert.equal(zScore(62, { mean: 58, std: 2 }), 2);
  assert.equal(zScore(58, { mean: 58, std: 0 }), 0);
  assert.equal(zScore(null, { mean: 58, std: 2 }), null);
  assert.equal(zScore(62, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/baseline.test.js`
Expected: FAIL — cannot find module `../src/baseline.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/baseline.js
import { METRICS } from './metrics.js';

export function mean(xs) {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// Trailing baseline from a member's history (which already excludes `today`).
// Null/missing values are dropped per metric.
export function computeBaseline(history) {
  const out = {};
  for (const metric of METRICS) {
    const xs = history.filter((d) => d && d[metric] != null).map((d) => d[metric]);
    out[metric] = { mean: mean(xs), std: std(xs) };
  }
  return out;
}

// Standard score of a value vs a {mean,std} baseline. null when not computable.
export function zScore(value, base) {
  if (value == null || base == null || base.mean == null) return null;
  if (!base.std) return 0;
  return (value - base.mean) / base.std;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/baseline.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/baseline.js tests/baseline.test.js
git commit -m "feat: shared baseline (mean/std/zScore) computation"
```

---

## Task 4: Synthetic generator (`src/generator.js`)

Per-person means, small daily wobble, and a **correlation**: a poor-sleep night nudges the *next* day's resting HR up and HRV down — so multi-signal reasoning has something real to find.

**Files:**
- Create: `src/generator.js`
- Test: `tests/generator.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/generator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDay, generateMemberSeries, generateNormalData } from '../src/generator.js';
import { PROFILES, METRICS } from '../src/metrics.js';
import { computeBaseline, zScore } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');

test('isoDay counts back in whole days', () => {
  assert.equal(isoDay(TODAY, 0), '2026-06-03');
  assert.equal(isoDay(TODAY, 1), '2026-06-02');
});

test('series is deterministic given a seed and has days+1 entries', () => {
  const a = generateMemberSeries(PROFILES[0], { today: TODAY, days: 30, seed: 5 });
  const b = generateMemberSeries(PROFILES[0], { today: TODAY, days: 30, seed: 5 });
  assert.equal(a.length, 31);
  assert.deepEqual(a, b);
});

test('values sit near the profile mean (realistic, not wild)', () => {
  const s = generateMemberSeries(PROFILES[0], { today: TODAY, days: 60, seed: 3 });
  const hist = s.slice(0, -1);
  const base = computeBaseline(hist);
  for (const m of METRICS) {
    assert.ok(Math.abs(base[m].mean - PROFILES[0].means[m]) < PROFILES[0].means[m] * 0.1,
      `${m} mean ${base[m].mean} far from profile ${PROFILES[0].means[m]}`);
  }
});

test('on a normal day extreme |z|>=3 values stay within the statistical tail', () => {
  // STATISTICAL assertion (NOT a cherry-picked seed): loop many deterministic seeds and
  // assert the FRACTION of |z|>=3 metric-values stays below an explicit tail (~1–2%).
  // A single random seed can throw a >=3 sigma value legitimately; only the long-run rate matters.
  let total = 0, extreme = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const members = generateNormalData({ today: TODAY, days: 30, baseSeed: seed });
    for (const mem of members) {
      const base = computeBaseline(mem.history);
      for (const metric of METRICS) {
        const z = zScore(mem.today[metric], base[metric]);
        if (z == null) continue;
        total++;
        if (Math.abs(z) >= 3) extreme++;
      }
    }
  }
  const frac = extreme / total;
  assert.ok(frac < 0.02, `|z|>=3 fraction ${(frac * 100).toFixed(2)}% exceeds 2% tail (n=${total})`);
});

test('sleep deviation couples to NEXT-day rhr (negative) and hrv (positive) with real effect size', () => {
  // The multi-signal story must be REAL, not just asserted by construction.
  // Build a long single-member series and measure lag-1 coupling of sleep_eff deviation(t)
  // against rhr(t+1) and hrv(t+1): assert SIGN and an effect-size floor.
  const s = generateMemberSeries(PROFILES[0], { today: TODAY, days: 400, seed: 17 });
  const base = computeBaseline(s.slice(0, -1));
  const sleepDev = s.map((d) => d.sleep_eff - base.sleep_eff.mean);
  const rhrDev = s.map((d) => d.rhr - base.rhr.mean);
  const hrvDev = s.map((d) => d.hrv - base.hrv.mean);

  const corr = (a, b) => {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n;
    const mb = b.reduce((s, x) => s + x, 0) / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
    return cov / Math.sqrt(va * vb);
  };

  // lag-1: sleepDev[t] vs metric[t+1]
  const sleepT = sleepDev.slice(0, -1);
  const rhrNext = rhrDev.slice(1);
  const hrvNext = hrvDev.slice(1);
  const cRhr = corr(sleepT, rhrNext);
  const cHrv = corr(sleepT, hrvNext);

  // poor sleep (negative dev) raises next-day rhr => NEGATIVE correlation
  assert.ok(cRhr < 0, `sleep→next-day rhr corr ${cRhr.toFixed(3)} should be negative`);
  // poor sleep lowers next-day hrv => POSITIVE correlation (both move down together)
  assert.ok(cHrv > 0, `sleep→next-day hrv corr ${cHrv.toFixed(3)} should be positive`);
  // effect-size floor so a near-zero coupling fails (raise coupling / lower noise if this trips)
  assert.ok(Math.abs(cRhr) >= 0.1, `sleep→rhr coupling ${cRhr.toFixed(3)} too weak (|corr|>=0.1)`);
  assert.ok(Math.abs(cHrv) >= 0.1, `sleep→hrv coupling ${cHrv.toFixed(3)} too weak (|corr|>=0.1)`);
});

test('generateNormalData returns 3 members with history + today', () => {
  const members = generateNormalData({ today: TODAY, days: 30, baseSeed: 1 });
  assert.equal(members.length, 3);
  for (const mem of members) {
    assert.equal(mem.history.length, 30);
    assert.ok(mem.today && mem.today.date === '2026-06-03');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/generator.test.js`
Expected: FAIL — cannot find module `../src/generator.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/generator.js
import { PROFILES, NOISE, roundMetric } from './metrics.js';
import { makeRng, gaussian } from './random.js';

// ISO (YYYY-MM-DD) for `daysAgo` days before the given `today` Date.
export function isoDay(today, daysAgo) {
  const d = new Date(today.getTime() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

// One member's series: `days` history entries + today (last). Deterministic by seed.
// Correlation: a poor-sleep night (negative sleep delta) raises NEXT day rhr, lowers hrv.
export function generateMemberSeries(profile, { today, days = 30, seed }) {
  const rng = makeRng(seed);
  const series = [];
  let prevSleepDelta = 0; // yesterday's deviation from sleep mean
  for (let i = days; i >= 0; i--) {
    const day = { date: isoDay(today, i) };

    const sleepRaw = gaussian(rng, profile.means.sleep_eff, NOISE.sleep_eff);
    const sleepDelta = sleepRaw - profile.means.sleep_eff;
    day.sleep_eff = roundMetric('sleep_eff', sleepRaw);

    // poor sleep yesterday (delta<0) => rhr up
    day.rhr = roundMetric('rhr', gaussian(rng, profile.means.rhr, NOISE.rhr) - 0.25 * prevSleepDelta);
    // poor sleep yesterday => hrv down
    day.hrv = roundMetric('hrv', gaussian(rng, profile.means.hrv, NOISE.hrv) + 0.30 * prevSleepDelta);
    // steps wobble independently
    day.steps = roundMetric('steps', gaussian(rng, profile.means.steps, NOISE.steps));

    series.push(day);
    prevSleepDelta = sleepDelta;
  }
  return series;
}

// All members normal. Returns Member[] with `history` (excl. today) and `today`.
export function generateNormalData({ today, days = 30, baseSeed = 1 }) {
  return PROFILES.map((profile, idx) => {
    const series = generateMemberSeries(profile, { today, days, seed: baseSeed + idx * 1000 });
    return {
      id: profile.id,
      name: profile.name,
      history: series.slice(0, -1),
      today: series[series.length - 1],
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/generator.test.js`
Expected: PASS (6 tests). The extreme-value test is statistical (it loops 200 seeds and asserts the |z|>=3 fraction stays under the ~2% tail) — do NOT cherry-pick a single passing seed and do NOT widen any per-value threshold. If the correlation test's effect-size floor (|corr|>=0.1) fails, raise the sleep→rhr/hrv coupling coefficients in `generateMemberSeries` or lower `NOISE`, never lower the floor.

- [ ] **Step 5: Commit**

```bash
git add src/generator.js tests/generator.test.js
git commit -m "feat: correlated synthetic data generator"
```

---

## Task 5: Scenarios — fixed + perturbation engine (`src/scenarios.js`)

Two fixed scenarios always available, plus the engine that applies numeric deltas to one member's recent days (used by both fixed and LLM scenarios). **No labels travel into member data.**

**Files:**
- Create: `src/scenarios.js`
- Test: `tests/scenarios.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/scenarios.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_SCENARIOS, applyPerturbations, applyStaleData, validateScenario } from '../src/scenarios.js';
import { generateNormalData } from '../src/generator.js';
import { computeBaseline, zScore } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');
const fresh = () => generateNormalData({ today: TODAY, days: 30, baseSeed: 21 });

test('fixed scenarios are exactly all_normal and stale_data', () => {
  assert.deepEqual(FIXED_SCENARIOS, ['all_normal', 'stale_data']);
});

test('applyPerturbations shifts today and pushes z-score out', () => {
  const members = fresh();
  const target = members[1];
  const before = zScore(target.today.rhr, computeBaseline(target.history).rhr);
  applyPerturbations(target, [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -8 } }]);
  const after = zScore(target.today.rhr, computeBaseline(target.history).rhr);
  assert.ok(after > before + 2, `rhr z should jump (before ${before}, after ${after})`);
});

test('applyStaleData nulls today and the prior day (synced 2 days ago)', () => {
  const members = fresh();
  const target = members[2];
  applyStaleData(target, 2);
  assert.equal(target.today, null);
  const last = target.history[target.history.length - 1];
  assert.equal(last.rhr, null);
  assert.ok(last.date, 'date is preserved on a missing day');
});

test('validateScenario accepts good shape and rejects emergencies', () => {
  assert.ok(validateScenario({ label: 'mild_illness', perturbations: [{ offset: 0, deltas: { rhr: 6 } }] }).ok);
  // delta too large => emergency-territory => rejected
  assert.equal(validateScenario({ label: 'x', perturbations: [{ offset: 0, deltas: { rhr: 60 } }] }).ok, false);
  // unknown metric => rejected
  assert.equal(validateScenario({ label: 'x', perturbations: [{ offset: 0, deltas: { bp: 5 } }] }).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scenarios.test.js`
Expected: FAIL — cannot find module `../src/scenarios.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scenarios.js
import { METRICS, roundMetric } from './metrics.js';

export const FIXED_SCENARIOS = ['all_normal', 'stale_data'];

// Largest plausible single-day delta per metric. Bigger => "emergency territory" => rejected.
// Keeps LLM scenarios in drift / fatigue / mild-illness range (non-emergency goal).
const MAX_DELTA = { rhr: 18, sleep_eff: 30, steps: 9000, hrv: 35 };

// Mutate a member's recent days in place. offset 0 = today, 1 = yesterday, …
// perturbations: [{ offset, deltas: { rhr: +8, hrv: -12, … } }]
export function applyPerturbations(member, perturbations) {
  const series = member.today ? [...member.history, member.today] : [...member.history];
  const lastIdx = series.length - 1; // today (or most recent) is last
  for (const p of perturbations) {
    const idx = lastIdx - p.offset;
    if (idx < 0 || !series[idx]) continue;
    for (const metric of METRICS) {
      const delta = p.deltas?.[metric];
      if (delta != null && series[idx][metric] != null) {
        series[idx][metric] = roundMetric(metric, series[idx][metric] + delta);
      }
    }
  }
}

// Member stopped syncing `missingDays` ago: today=null + (missingDays-1) prior days nulled.
export function applyStaleData(member, missingDays = 2) {
  member.today = null;
  for (let k = 0; k < missingDays - 1; k++) {
    const idx = member.history.length - 1 - k;
    if (idx >= 0) {
      member.history[idx] = { date: member.history[idx].date, rhr: null, sleep_eff: null, steps: null, hrv: null };
    }
  }
}

// Validate an LLM-proposed scenario: known metrics, numeric deltas within non-emergency bounds.
export function validateScenario(scenario) {
  if (!scenario || typeof scenario.label !== 'string' || !Array.isArray(scenario.perturbations)) {
    return { ok: false, reason: 'missing label or perturbations[]' };
  }
  for (const p of scenario.perturbations) {
    if (typeof p.offset !== 'number' || p.offset < 0 || !p.deltas || typeof p.deltas !== 'object') {
      return { ok: false, reason: 'bad perturbation entry' };
    }
    for (const [metric, delta] of Object.entries(p.deltas)) {
      if (!METRICS.includes(metric)) return { ok: false, reason: `unknown metric ${metric}` };
      if (typeof delta !== 'number' || Number.isNaN(delta)) return { ok: false, reason: `non-numeric delta for ${metric}` };
      if (Math.abs(delta) > MAX_DELTA[metric]) return { ok: false, reason: `${metric} delta ${delta} exceeds non-emergency bound` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scenarios.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scenarios.js tests/scenarios.test.js
git commit -m "feat: fixed scenarios + perturbation engine + scenario validation"
```

---

## Task 6: Gemini client wrapper (`src/llm.js`)

Config from env (model + key swappable), one method `generateJson(prompt, schema)`. Kept thin so analyst/scenario-generator can be tested with a fake client.

**Files:**
- Create: `src/llm.js`
- Test: `tests/llm.test.js`

- [ ] **Step 1: Write the failing test** (config only — no network)

```js
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
  assert.equal(stripFence('{"a":1}'), '{"a":1}');         // bare JSON untouched
  assert.equal(stripFence('  {"a":1}  '), '{"a":1}');     // trims whitespace
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/llm.test.js`
Expected: FAIL — cannot find module `../src/llm.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/llm.js
import { GoogleGenAI } from '@google/genai';

export function getConfig(env = process.env) {
  return {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
}

// Strip a leading/trailing ```json … ``` fence some models add despite responseMimeType:'application/json'.
// Pure + exported so the parse-defensive path is unit-testable without a network call.
export function stripFence(text) {
  const t = (text ?? '').trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

// Returns { model, generateJson(prompt, schema?) -> parsed JSON object }.
export function makeClient(config = getConfig()) {
  if (!config.apiKey) throw new Error('GEMINI_API_KEY is not set');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  return {
    model: config.model,
    async generateJson(prompt, schema) {
      const call = () => ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...(schema ? { responseSchema: schema } : {}),
        },
      });
      // Parse defensively: strip a stray code fence, and retry ONCE if the first
      // response isn't valid JSON (flash models occasionally fence or truncate).
      let text = stripFence((await call()).text);
      try {
        return JSON.parse(text);
      } catch {
        text = stripFence((await call()).text);
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Gemini returned non-JSON after retry: ${text.slice(0, 200)}`);
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/llm.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm.js tests/llm.test.js
git commit -m "feat: Gemini client wrapper (env-config, JSON output)"
```

---

## Task 7: LLM scenario generator (`src/scenarioGenerator.js`)

Asks Gemini for an open-ended pool of **non-emergency** anomaly scenarios, validates each, drops the bad ones, and picks one to apply to a member. Upholds the information barrier: this is the *only* place the label exists, and it is returned separately from the data.

**Files:**
- Create: `src/scenarioGenerator.js`
- Test: `tests/scenarioGenerator.test.js`

- [ ] **Step 1: Write the failing test** (fake client — no network)

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scenarioGenerator.test.js`
Expected: FAIL — cannot find module `../src/scenarioGenerator.js`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scenarioGenerator.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scenarioGenerator.js tests/scenarioGenerator.test.js
git commit -m "feat: LLM-driven non-emergency scenario pool with validation"
```

---

## Task 8: Store I/O (`src/store.js`)

**Files:**
- Create: `src/store.js`
- Test: `tests/store.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store.test.js`
Expected: FAIL — cannot find module `../src/store.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/store.js
import { readFile, writeFile } from 'node:fs/promises';

export async function writeStore(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

export async function readStore(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat: JSON store read/write"
```

---

## Task 9: The analyst (`src/analyst.js`) — prompt, schema, info barrier

Builds per-member context from data + baselines (and **only** that), defines the safety-framed prompt and the structured-output schema, and runs the LLM.

**Files:**
- Create: `src/analyst.js`
- Test: `tests/analyst.test.js`

- [ ] **Step 1: Write the failing test** (fake client + barrier assertions)

```js
// tests/analyst.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentWindow, buildMemberContext, buildPrompt, runAnalyst, validateReport, ANALYST_SCHEMA } from '../src/analyst.js';
import { generateNormalData } from '../src/generator.js';
import { applyPerturbations } from '../src/scenarios.js';
import { computeBaseline } from '../src/baseline.js';

const TODAY = new Date('2026-06-03T12:00:00Z');
function dataset() {
  const members = generateNormalData({ today: TODAY, days: 30, baseSeed: 31 });
  applyPerturbations(members[1], [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -9 } }]);
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));
  return { members, baselines, label: 'poor_recovery' };
}

test('recentWindow returns the last N days including today', () => {
  const { members } = dataset();
  const w = recentWindow(members[0], 7);
  assert.equal(w.length, 7);
  assert.equal(w[w.length - 1].date, '2026-06-03');
});

test('member context carries baseline + recent days but NO scenario label', () => {
  const { members, baselines, label } = dataset();
  const ctx = buildMemberContext(members[1], baselines);
  assert.ok(ctx.baseline.rhr.mean > 0);
  assert.ok(Array.isArray(ctx.recent_days));
  assert.ok(!JSON.stringify(ctx).includes(label), 'context must not leak the scenario label');
});

test('INFORMATION BARRIER: prompt never contains the scenario label', () => {
  const { members, baselines, label } = dataset();
  const prompt = buildPrompt(members, baselines);
  assert.ok(!prompt.includes(label), 'prompt leaked the hidden scenario label');
  assert.ok(prompt.includes('baseline'), 'prompt should present baselines');
});

test('runAnalyst passes the schema and returns the model JSON', async () => {
  const { members, baselines } = dataset();
  let sawSchema = null, sawPrompt = null;
  const fake = { async generateJson(p, s) { sawPrompt = p; sawSchema = s; return { date: '2026-06-03', headline: 'ok', members: [] }; } };
  const out = await runAnalyst(fake, members, baselines);
  assert.equal(sawSchema, ANALYST_SCHEMA);
  assert.ok(sawPrompt.length > 0);
  assert.equal(out.headline, 'ok');
});

// --- validateReport: catches malformed real LLM output before write/send ---
const MEMBERS3 = [{ name: 'Alex' }, { name: 'Sam' }, { name: 'Priya' }];
const goodReport = () => ({
  date: '2026-06-03',
  headline: 'Three steady.',
  members: [
    { name: 'Alex', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
    { name: 'Sam', status: 'worth_noting', summary: 'rhr up', changed_signals: [{ metric: 'rhr', z: 2.4, phrase: 'resting heart rate noticeably higher than usual' }], suggestion: 'Take it easy.' },
    { name: 'Priya', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
  ],
});

test('validateReport accepts a well-formed report', () => {
  assert.equal(validateReport(goodReport(), MEMBERS3).ok, true);
});

test('validateReport rejects missing required top-level fields', () => {
  const r = goodReport(); delete r.headline;
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects a status not in the enum', () => {
  const r = goodReport(); r.members[1].status = 'alarm';
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects a member-name mismatch', () => {
  const r = goodReport(); r.members[0].name = 'Bob';
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects a member count != 3', () => {
  const r = goodReport(); r.members.pop();
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});

test('validateReport rejects changed_signals that is not an array', () => {
  const r = goodReport(); r.members[0].changed_signals = 'rhr +2.4σ';
  assert.equal(validateReport(r, MEMBERS3).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/analyst.test.js`
Expected: FAIL — cannot find module `../src/analyst.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/analyst.js
import { METRIC_META } from './metrics.js';

// Recent window (default 7 days incl. today) shown to the analyst.
export function recentWindow(member, n = 7) {
  const series = [...member.history];
  if (member.today) series.push(member.today);
  return series.slice(-n);
}

// The per-member block the LLM sees. MUST NOT include any scenario label.
export function buildMemberContext(member, baselines) {
  return {
    name: member.name,
    synced_today: member.today != null,
    baseline: baselines[member.id],
    recent_days: recentWindow(member),
    today: member.today,
  };
}

export const ANALYST_SYSTEM = `You are a careful family health analyst reviewing wearable data.
You receive, for each person: their personal BASELINE (mean and std per metric) computed from their own
recent history, their last several days, and today's values. Metrics: rhr (resting HR, bpm — lower is
usually better), sleep_eff (sleep efficiency %), steps, hrv (heart-rate variability ms — higher is
usually better).

How to reason:
- Judge every value RELATIVE TO THAT PERSON'S OWN BASELINE, not generic norms. "Normal" differs per person.
- SYNTHESIZE across signals. A single metric off by a little is usually noise. The interesting cases are
  when several signals move together (e.g. resting HR up WHILE hrv and sleep efficiency are down — that
  pattern reads as poor recovery / possible oncoming illness, something no single threshold would catch).
- If a person did not sync today (synced_today=false), say so plainly and note how long data has been
  missing; do not invent values.
- It is not only acceptable but expected to say "all clear" / "nothing notable" for people who are within
  their normal range. Do not manufacture concern. A quiet day should read as a quiet day.

Safety framing (always):
- You DESCRIBE patterns and may suggest "worth a check-in" or "worth mentioning to a doctor."
- You NEVER diagnose a condition and NEVER alarm. No "you have X". No emergencies.

Output: for each person give status ('all_clear', 'worth_noting', or 'no_data'), a one-to-two sentence
summary, and changed_signals. Each changed_signal is an OBJECT carrying BOTH the raw operator detail and a
plain-language family phrase: { "metric": one of rhr|sleep_eff|steps|hrv, "z": signed number of sigmas
(e.g. 2.4 or -1.9), "phrase": a short plain-English sentence a family member understands
(e.g. "resting heart rate noticeably higher than usual", "HRV lower than usual") }. When all clear,
changed_signals is an empty array. Always provide a gentle suggestion as a STRING; use an empty string ""
to mean "no suggestion" (do NOT omit the field, do NOT use null). Also give a one-line headline
summarizing the whole family and the date.`;

// Structured-output schema for Gemini (responseSchema).
//
// NOTE on `nullable`: @google/genai's responseSchema is a CONSTRAINED OpenAPI subset, and support for
// `nullable:true` is VERSION-DEPENDENT — on the pinned SDK version it may be ignored or rejected. To stay
// portable we do NOT mark anything nullable in this schema: `suggestion` is a REQUIRED string where ''
// means "no suggestion" (see prompt). Nullability/optionality is enforced in `validateReport` instead, not
// in the wire schema. Each changed_signal carries BOTH the raw operator detail (metric + signed z) AND a
// plain-language family phrase.
export const ANALYST_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string' },
    headline: { type: 'string' },
    members: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['all_clear', 'worth_noting', 'no_data'] },
          summary: { type: 'string' },
          changed_signals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                metric: { type: 'string', enum: ['rhr', 'sleep_eff', 'steps', 'hrv'] },
                z: { type: 'number' },
                phrase: { type: 'string' },
              },
              required: ['metric', 'z', 'phrase'],
            },
          },
          suggestion: { type: 'string' }, // '' means none; nullability handled in validateReport
        },
        required: ['name', 'status', 'summary', 'changed_signals', 'suggestion'],
      },
    },
  },
  required: ['date', 'headline', 'members'],
};

// Defensive guard for the REAL LLM output before it is written/sent. Returns { ok, reason }.
// `members` is the list the analyst was asked about (any objects carrying a `.name`); we check
// shape, the status enum, member count, name match, and that changed_signals is an array.
const STATUS_ENUM = ['all_clear', 'worth_noting', 'no_data'];
export function validateReport(report, members) {
  if (!report || typeof report !== 'object') return { ok: false, reason: 'report is not an object' };
  if (typeof report.date !== 'string' || !report.date) return { ok: false, reason: 'missing date' };
  if (typeof report.headline !== 'string' || !report.headline) return { ok: false, reason: 'missing headline' };
  if (!Array.isArray(report.members)) return { ok: false, reason: 'members is not an array' };
  if (report.members.length !== members.length) {
    return { ok: false, reason: `member count ${report.members.length} != ${members.length}` };
  }
  const expectedNames = new Set(members.map((m) => m.name));
  for (const rm of report.members) {
    if (!rm || typeof rm !== 'object') return { ok: false, reason: 'member entry not an object' };
    if (typeof rm.name !== 'string' || !expectedNames.has(rm.name)) {
      return { ok: false, reason: `unexpected member name ${JSON.stringify(rm?.name)}` };
    }
    if (!STATUS_ENUM.includes(rm.status)) return { ok: false, reason: `bad status ${JSON.stringify(rm.status)} for ${rm.name}` };
    if (typeof rm.summary !== 'string') return { ok: false, reason: `missing summary for ${rm.name}` };
    if (!Array.isArray(rm.changed_signals)) return { ok: false, reason: `changed_signals not an array for ${rm.name}` };
    if (typeof rm.suggestion !== 'string') return { ok: false, reason: `suggestion not a string for ${rm.name}` };
  }
  return { ok: true };
}

export function buildPrompt(members, baselines) {
  const people = members.map((m) => buildMemberContext(m, baselines));
  const metricsLegend = Object.entries(METRIC_META)
    .map(([k, v]) => `${k}=${v.label} (${v.unit}, ${v.better} is better)`)
    .join('; ');
  return `${ANALYST_SYSTEM}

Metric legend: ${metricsLegend}

DATA (synthetic, ${people.length} people):
${JSON.stringify(people, null, 2)}

Respond ONLY with JSON matching the required schema.`;
}

export async function runAnalyst(client, members, baselines) {
  return client.generateJson(buildPrompt(members, baselines), ANALYST_SCHEMA);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/analyst.test.js`
Expected: PASS (10 tests — 4 context/barrier/runAnalyst + 6 validateReport).

- [ ] **Step 5: Commit**

```bash
git add src/analyst.js tests/analyst.test.js
git commit -m "feat: analyst prompt, schema, info-barrier context builder"
```

---

## Task 10: Telegram delivery (`src/telegram.js`)

Formats the report into a readable message and POSTs it. `fetch` is injectable for testing.

**Files:**
- Create: `src/telegram.js`
- Test: `tests/telegram.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReport, sendTelegram, getTelegramConfig } from '../src/telegram.js';

const report = {
  date: '2026-06-03',
  headline: 'Three steady, one worth a check-in.',
  members: [
    { name: 'Alex', status: 'all_clear', summary: 'Within range.', changed_signals: [], suggestion: '' },
    { name: 'Sam', status: 'worth_noting', summary: 'RHR up, HRV/sleep down.',
      changed_signals: [
        { metric: 'rhr', z: 2.4, phrase: 'resting heart rate noticeably higher than usual' },
        { metric: 'hrv', z: -1.9, phrase: 'HRV lower than usual' },
      ],
      suggestion: 'Take it easy.' },
  ],
};

test('formatReport leads with the synthetic-data disclosure and the value headline', () => {
  const text = formatReport(report);
  const lines = text.split('\n');
  assert.ok(/simulated|synthetic/i.test(lines[0]), 'first line must disclose synthetic data');
  assert.ok(text.includes('Three steady'));
  assert.ok(text.includes('Sam'));
  assert.ok(text.includes('Alex'));
});

test('formatReport renders changed_signals in plain language, not raw sigma', () => {
  const text = formatReport(report);
  assert.ok(text.includes('resting heart rate noticeably higher than usual'));
  assert.ok(!/rhr\s*\+?2\.4σ/.test(text), 'must NOT show raw "rhr +2.4σ" in the family message');
  assert.ok(!text.includes('σ'), 'no sigma symbol in the family-facing Telegram message');
});

test('formatReport + sendTelegram deliver text with Markdown metacharacters safely (no throw)', async () => {
  const tricky = {
    date: '2026-06-03',
    headline: 'Heads-up: _underscores_ * stars * [brackets] and `backticks` 100% fine.',
    members: [
      { name: 'Sam_*[`', status: 'worth_noting', summary: 'a_b *c* [d] `e`',
        changed_signals: [{ metric: 'rhr', z: 2.4, phrase: 'resting heart rate higher (≈ +2.4 _units_)' }],
        suggestion: 'mention `it` to a doctor_' },
    ],
  };
  const text = formatReport(tricky);
  let calledBody;
  const fakeFetch = async (url, opts) => { calledBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; };
  await sendTelegram(text, { token: 'TOK', chatId: '123' }, fakeFetch);
  // plain text: payload carries the raw characters verbatim and has NO parse_mode
  assert.equal(calledBody.text, text);
  assert.ok(calledBody.text.includes('`backticks`'));
  assert.ok(!('parse_mode' in calledBody), 'must send plain text (no parse_mode)');
});

test('sendTelegram posts to the bot API as plain text and resolves on ok', async () => {
  let calledUrl, calledBody;
  const fakeFetch = async (url, opts) => {
    calledUrl = url; calledBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await sendTelegram('hello', { token: 'TOK', chatId: '123' }, fakeFetch);
  assert.ok(calledUrl.includes('/botTOK/sendMessage'));
  assert.equal(calledBody.chat_id, '123');
  assert.equal(calledBody.text, 'hello');
  assert.ok(!('parse_mode' in calledBody), 'no parse_mode — plain text');
});

test('sendTelegram retries once as plain text then throws surfacing the API description', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return { ok: false, status: 400, json: async () => ({ ok: false, description: "can't parse entities" }) };
  };
  await assert.rejects(
    () => sendTelegram('x', { token: 't', chatId: 'c' }, fakeFetch),
    (e) => /400/.test(e.message) && /can't parse entities/.test(e.message),
  );
  assert.equal(calls, 2, 'should attempt the send twice (initial + one retry)');
});

test('getTelegramConfig reads env', () => {
  const c = getTelegramConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' });
  assert.deepEqual(c, { token: 't', chatId: 'c' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/telegram.test.js`
Expected: FAIL — cannot find module `../src/telegram.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/telegram.js

export function getTelegramConfig(env = process.env) {
  return { token: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '' };
}

const ICON = { all_clear: '🟢', worth_noting: '🟡', no_data: '⚪️' };

// Render one changed_signal in PLAIN LANGUAGE for the family (never raw "rhr +2.4σ").
// Accepts the structured object { metric, z, phrase }; falls back gracefully for older shapes.
function signalPhrase(sig) {
  if (sig && typeof sig === 'object' && sig.phrase) return sig.phrase;
  return typeof sig === 'string' ? sig : '';
}

// Plain-text rendering of the report. NO Markdown — sent with no parse_mode, so stray
// _ * [ ] ` characters in LLM free text are delivered verbatim and never cause an HTTP 400.
// The synthetic-data disclosure is the FIRST line; the value headline leads the body.
export function formatReport(report) {
  const lines = [];
  lines.push('Synthetic demo data — not real health measurements; no action needed.');
  lines.push('');
  lines.push(report.headline);
  lines.push(`Daily Health Report — ${report.date}`);
  lines.push('');
  for (const m of report.members) {
    lines.push(`${ICON[m.status] || '•'} ${m.name} — ${m.summary}`);
    const phrases = (m.changed_signals || []).map(signalPhrase).filter(Boolean);
    if (phrases.length) lines.push(`   ${phrases.join('; ')}`);
    if (m.suggestion) lines.push(`   ↳ ${m.suggestion}`);
  }
  return lines.join('\n');
}

export async function sendTelegram(text, config = getTelegramConfig(), fetchImpl = fetch) {
  if (!config.token || !config.chatId) throw new Error('Telegram config missing (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
  const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
  // Plain text only (no parse_mode): a reliable message beats a bold one.
  const post = () => fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
  });

  let res = await post();
  if (!res.ok) {
    // Defense-in-depth: retry once as plain text before giving up.
    res = await post();
    if (!res.ok) {
      let description = '';
      try { description = (await res.json())?.description || ''; } catch { /* ignore */ }
      throw new Error(`Telegram sendMessage failed: ${res.status}${description ? ` — ${description}` : ''}`);
    }
  }
  return res.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/telegram.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/telegram.js tests/telegram.test.js
git commit -m "feat: Telegram delivery + report formatting"
```

---

## Task 11: Orchestration entrypoint (`analyst.js` at repo root)

Wires the pipeline the GitHub Action runs. Exported `run({...deps})` is fully testable with fakes; a thin CLI guard at the bottom runs it for real.

**Files:**
- Create: `analyst.js` (repo root)
- Test: `tests/run.test.js`

- [ ] **Step 1: Write the failing test** (drive `run` with fakes, assert barrier + consistency)

```js
// tests/run.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../analyst.js';

const TODAY = new Date('2026-06-03T12:00:00Z');

function deps(overrides = {}) {
  const writes = {};
  return {
    today: TODAY,
    seed: 7,
    env: { },
    // analyst client: capture the prompt so we can assert the barrier end-to-end
    llmClient: {
      _prompt: null,
      async generateJson(prompt) { this._prompt = prompt; return { date: '2026-06-03', headline: 'h', members: [] }; },
    },
    scenarioPool: async () => ([
      { label: 'poor_recovery', perturbations: [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -9 } }] },
    ]),
    sendMessage: async () => { writes.sent = true; },
    write: async (path, data) => { writes[path] = data; },
    writes,
    ...overrides,
  };
}

test('all_normal: no scenario label, telegram sent, store consistent', async () => {
  const d = deps({ scenario: 'all_normal' });
  const data = await run(d);
  assert.equal(data.scenario, 'all_normal');
  assert.equal(data.simulated, true);
  assert.ok(data.baselines.m1.rhr.mean > 0);
  // consistency: stored baselines are the same object the analyst saw (computed once)
  assert.ok(d.writes['data.json']);
  assert.ok(d.writes.sent, 'report pushed to telegram');
});

test('llm scenario: hidden label never reaches the analyst prompt', async () => {
  const d = deps({ scenario: 'llm' });
  const data = await run(d);
  assert.equal(data.scenario, 'poor_recovery');
  assert.ok(data.scenario_member, 'records which member was targeted');
  assert.ok(!d.llmClient._prompt.includes('poor_recovery'), 'INFORMATION BARRIER breached');
});

test('stale_data: target member has today=null', async () => {
  const d = deps({ scenario: 'stale_data' });
  const data = await run(d);
  const stale = data.members.find((m) => m.id === data.scenario_member);
  assert.equal(stale.today, null);
});
```

**REVISED (supersedes the Step 1 block above):** the run() contract now derives seed+target from a UTC report-date hash, gates scenarios behind a pure `shouldFireScenario`, validates the report, and stores a scenario-family-aware `eval` + telemetry. Use these tests instead.

```js
// tests/run.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, shouldFireScenario, scenarioFamily, evalReport } from '../analyst.js';

const TODAY = new Date('2026-06-03T12:00:00Z');

function deps(overrides = {}) {
  const writes = {};
  return {
    today: TODAY,
    env: {},
    llmClient: {
      _prompt: null,
      async generateJson(prompt) {
        this._prompt = prompt;
        // echo a valid 3-member report; names filled by run() are Alex/Sam/Priya
        return {
          date: '2026-06-03', headline: 'h',
          members: [
            { name: 'Alex', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
            { name: 'Sam', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
            { name: 'Priya', status: 'all_clear', summary: 'ok', changed_signals: [], suggestion: '' },
          ],
        };
      },
    },
    scenarioPool: async () => ([
      { label: 'poor_recovery', perturbations: [{ offset: 0, deltas: { rhr: 8, hrv: -12, sleep_eff: -9 } }] },
    ]),
    sendMessage: async (text) => { writes.sent = true; writes.sentText = text; },
    write: async (path, data) => { writes[path] = data; },
    writes,
    ...overrides,
  };
}

// --- shouldFireScenario: the quiet-by-default cadence gate ---
test('shouldFireScenario fires on 8–18% of days across a year (deterministic, no force)', () => {
  let fired = 0;
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365; i++) {
    if (shouldFireScenario(new Date(base + i * 86400000), {})) fired++;
  }
  const frac = fired / 365;
  assert.ok(frac >= 0.08 && frac <= 0.18, `fired fraction ${(frac * 100).toFixed(1)}% outside 8–18% band`);
});

test('shouldFireScenario is deterministic per date', () => {
  const d = new Date('2026-06-03T00:00:00Z');
  assert.equal(shouldFireScenario(d, {}), shouldFireScenario(new Date('2026-06-03T23:59:00Z'), {}));
});

test('shouldFireScenario force:true always fires', () => {
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 30; i++) {
    assert.equal(shouldFireScenario(new Date(base + i * 86400000), { force: true }), true);
  }
});

test('gate-false day yields all_normal with no member perturbed', async () => {
  // find a date the gate does NOT fire, drive run() with scenario:'auto' (gated path)
  let quietDay = null;
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365 && !quietDay; i++) {
    const d = new Date(base + i * 86400000);
    if (!shouldFireScenario(d, {})) quietDay = d;
  }
  const d = deps({ today: quietDay, scenario: 'auto' });
  const data = await run(d);
  assert.equal(data.scenario, 'all_normal');
  assert.equal(data.scenario_member, null);
  assert.equal(data.eval.scenario_applied, false);
  assert.equal(data.eval.detected, null);
});

// --- core run() contract ---
test('explicit all_normal: no label, telegram sent, store consistent', async () => {
  const d = deps({ scenario: 'all_normal' });
  const data = await run(d);
  assert.equal(data.scenario, 'all_normal');
  assert.equal(data.simulated, true);
  assert.ok(data.baselines.m1.rhr.mean > 0);
  assert.ok(d.writes['data.json']);
  assert.ok(d.writes.sent, 'report pushed to telegram');
  assert.equal(data.eval.scenario_applied, false);
});

test('explicit SCENARIO bypasses the gate: llm label never reaches the analyst prompt', async () => {
  const d = deps({ scenario: 'llm' });
  const data = await run(d);
  assert.equal(data.scenario, 'poor_recovery');
  assert.ok(data.scenario_member, 'records which member was targeted');
  assert.ok(!d.llmClient._prompt.includes('poor_recovery'), 'INFORMATION BARRIER breached');
  assert.equal(data.eval.scenario_applied, true);
  assert.equal(data.eval.scenario_family, 'perturbation');
});

test('explicit stale_data: target member has today=null and eval expects no_data', async () => {
  const d = deps({ scenario: 'stale_data' });
  const data = await run(d);
  const stale = data.members.find((m) => m.id === data.scenario_member);
  assert.equal(stale.today, null);
  assert.equal(data.eval.scenario_family, 'stale_data');
});

test('baseline is computed from CLEAN data (uncontaminated by the injected anomaly)', async () => {
  const clean = deps({ scenario: 'all_normal' });
  const dirty = deps({ scenario: 'llm' });
  const c = await run(clean);
  const dr = await run(dirty);
  const target = dr.scenario_member;
  // perturbing only TODAY must not move that member's baseline mean vs the clean run
  assert.deepEqual(c.baselines[target].rhr, dr.baselines[target].rhr);
});

test('validateReport failure: fallback message sent, store still written, report flagged unavailable', async () => {
  const bad = deps({
    scenario: 'all_normal',
    llmClient: { async generateJson() { return { headline: 'no members here' }; } },
  });
  const data = await run(bad);
  assert.ok(bad.writes['data.json'], 'store still written on fallback');
  assert.ok(/unavailable/i.test(bad.writes.sentText), 'fallback plain-text message sent');
  assert.equal(data.report_valid, false);
  assert.equal(data.telemetry.telegram_ok, true);
});

test('telemetry is persisted', async () => {
  const d = deps({ scenario: 'llm' });
  const data = await run(d);
  const t = data.telemetry;
  assert.equal(typeof t.gate_fired, 'boolean');
  assert.equal(t.scenario_pool_size, 1);
  assert.equal(t.scenario_pool_valid, 1);
  assert.equal(typeof t.llm_ms, 'number');
  assert.ok(t.model !== undefined);
  assert.equal(t.telegram_ok, true);
});

// --- scenario-family-aware eval (offline, canned reports per family) ---
const MEMBERS3 = [{ id: 'm1', name: 'Alex' }, { id: 'm2', name: 'Sam' }, { id: 'm3', name: 'Priya' }];
const rep = (statuses) => ({
  date: 'd', headline: 'h',
  members: MEMBERS3.map((m, i) => ({ name: m.name, status: statuses[i], summary: '', changed_signals: [], suggestion: '' })),
});

test('scenarioFamily classifies labels', () => {
  assert.equal(scenarioFamily('all_normal'), 'all_normal');
  assert.equal(scenarioFamily('stale_data'), 'stale_data');
  assert.equal(scenarioFamily('poor_recovery'), 'perturbation');
});

test('eval: perturbation target worth_noting => detected', () => {
  const e = evalReport(rep(['all_clear', 'worth_noting', 'all_clear']),
    { scenario_family: 'perturbation', target_member: 'Sam' });
  assert.equal(e.detected, true);
  assert.deepEqual(e.false_positives, []);
});

test('eval: stale_data target no_data => detected=TRUE (not a miss)', () => {
  const e = evalReport(rep(['all_clear', 'no_data', 'all_clear']),
    { scenario_family: 'stale_data', target_member: 'Sam' });
  assert.equal(e.detected, true, 'a correct no_data on a stale target must score as detected');
  assert.deepEqual(e.false_positives, [], 'a no_data is not a false positive');
});

test('eval: all_normal with any worth_noting => false positive, detected=null', () => {
  const e = evalReport(rep(['all_clear', 'worth_noting', 'all_clear']),
    { scenario_family: 'all_normal', target_member: null });
  assert.equal(e.detected, null);
  assert.deepEqual(e.false_positives, ['Sam']);
});

test('eval: non-target worth_noting is a false positive', () => {
  const e = evalReport(rep(['worth_noting', 'worth_noting', 'all_clear']),
    { scenario_family: 'perturbation', target_member: 'Sam' });
  assert.equal(e.detected, true);
  assert.deepEqual(e.false_positives, ['Alex']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/run.test.js`
Expected: FAIL — cannot find module `../analyst.js` (and missing `shouldFireScenario`/`scenarioFamily`/`evalReport` exports).

- [ ] **Step 3: Write minimal implementation**

```js
// analyst.js  (repo root — the entrypoint GitHub Actions runs)
import { generateNormalData } from './src/generator.js';
import { computeBaseline } from './src/baseline.js';
import { applyPerturbations, applyStaleData, validateScenario } from './src/scenarios.js';
import { generateScenarioPool, pickScenario } from './src/scenarioGenerator.js';
import { runAnalyst, validateReport } from './src/analyst.js';
import { formatReport, sendTelegram, getTelegramConfig } from './src/telegram.js';
import { writeStore } from './src/store.js';
import { makeClient, getConfig } from './src/llm.js';
import { pathToFileURL } from 'node:url';

// Deterministic FNV-1a hash of the UTC calendar date (YYYY-MM-DD) — same date ⇒ same value,
// independent of time-of-day. Drives both the cadence gate and the daily seed/target rotation.
function hashDate(date) {
  const s = date.toISOString().slice(0, 10);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Quiet-by-default cadence gate. ~13% of days fire (lands in the tested 8–18% band over a year),
// deterministic per UTC date. force:true (workflow_dispatch) always fires. This is what keeps the
// family feed calm so a flag still means something.
export function shouldFireScenario(date, { force = false } = {}) {
  if (force) return true;
  return hashDate(date) % 1000 < 130;
}

// Classify a scenario label into the family the eval scores against.
export function scenarioFamily(label) {
  if (label === 'all_normal') return 'all_normal';
  if (label === 'stale_data') return 'stale_data';
  return 'perturbation';
}

// Scenario-family-aware scoring of the analyst against the stored answer key. The expected target
// status differs per family: perturbation ⇒ 'worth_noting', stale_data ⇒ 'no_data', all_normal ⇒
// no target. A 'no_data' is NEVER a false positive; only a NON-target 'worth_noting' is.
export function evalReport(report, { scenario_family, target_member }) {
  const expected = scenario_family === 'stale_data' ? 'no_data'
                 : scenario_family === 'perturbation' ? 'worth_noting'
                 : null;
  const byName = new Map(report.members.map((m) => [m.name, m.status]));
  const detected = target_member != null ? byName.get(target_member) === expected : null;
  const false_positives = report.members
    .filter((m) => m.name !== target_member && m.status === 'worth_noting')
    .map((m) => m.name);
  return { detected, false_positives };
}

// Pure, fully-injectable pipeline. Returns the store object it wrote.
export async function run(deps) {
  const {
    today,
    env = {},
    scenario = 'auto',     // 'auto' is gated; 'all_normal'|'stale_data'|'llm' bypass the gate
    force = false,         // workflow_dispatch can force a scenario on a gated day
    llmClient,
    scenarioPool = (client) => generateScenarioPool(client),
    sendMessage,
    write = writeStore,
    storePath = 'data.json',
  } = deps;

  // Daily seed + target rotate with the UTC date so the data differs each day and the flagged
  // member is not always the same person (was: fixed seed ⇒ always Sam).
  const dateHash = hashDate(today);
  const seed = dateHash % 100000;

  // 1. Everyone normal (clean).
  const members = generateNormalData({ today, days: 30, baseSeed: seed });
  const targetIdx = dateHash % members.length;

  // 2. Baselines computed ONCE from CLEAN history, BEFORE any scenario mutates the data, so a
  //    multi-day anomaly can't fold into the very baseline meant to reveal it. applyPerturbations
  //    mutates day objects in place (history too, for offset>0) and applyStaleData nulls trailing
  //    days — both must run AFTER this. Consumed by the analyst AND written for the dashboard.
  const baselines = Object.fromEntries(members.map((m) => [m.id, computeBaseline(m.history)]));

  // 3. Resolve the EFFECTIVE scenario. 'auto' is gated (quiet by default); explicit values bypass
  //    the gate so operators and demos still work.
  let gate_fired = false;
  let effective = scenario;
  if (scenario === 'auto') {
    gate_fired = shouldFireScenario(today, { force });
    effective = gate_fired ? 'llm' : 'all_normal';
  }

  // 4. Apply the effective scenario to ONE member. Label is operator-only (never sent to the LLM).
  let label = 'all_normal';
  let targetId = null;
  let scenario_pool_size = 0;
  let scenario_pool_valid = 0;
  if (effective === 'stale_data') {
    applyStaleData(members[targetIdx], 2);
    label = 'stale_data';
    targetId = members[targetIdx].id;
  } else if (effective === 'llm') {
    const pool = await scenarioPool(llmClient);
    scenario_pool_size = pool.length;
    scenario_pool_valid = pool.filter((s) => validateScenario(s).ok).length;
    const chosen = pickScenario(pool, seed);
    if (chosen) {
      applyPerturbations(members[targetIdx], chosen.perturbations);
      label = chosen.label;
      targetId = members[targetIdx].id;
    } else {
      label = 'all_normal'; // pool empty ⇒ fall back to a quiet day (logged for telemetry)
      console.warn('scenario pool empty — falling back to all_normal');
    }
  }
  const targetName = targetId ? members[targetIdx].name : null;

  // 5. Analyst sees data + baselines only — never the label. Tolerate a thrown/garbage response.
  const t0 = Date.now();
  let report = null;
  try { report = await runAnalyst(llmClient, members, baselines); }
  catch (e) { console.error('analyst failed:', e.message); }
  const llm_ms = Date.now() - t0;
  const model = llmClient?.model || env.GEMINI_MODEL || 'gemini-flash';

  // 6. Validate the (real, untrusted) LLM output. On failure, send a safe plain-text fallback
  //    rather than shipping a broken report — but still write the store for the dashboard.
  const report_valid = report ? validateReport(report, members).ok : false;
  const messageText = report_valid
    ? formatReport(report)
    : 'Daily Health Report unavailable today (technical issue) — data is synthetic, no action needed.';

  // 7. Scenario-family-aware eval against the stored answer key (only meaningful on a valid report).
  const fam = scenarioFamily(label);
  const scenario_applied = label !== 'all_normal';
  let evalResult = { scenario_applied, scenario_family: fam, target_member: targetName, detected: null, false_positives: [] };
  if (report_valid) {
    const r = evalReport(report, { scenario_family: fam, target_member: targetName });
    evalResult.detected = scenario_applied ? r.detected : null;
    evalResult.false_positives = r.false_positives;
  }

  // 8. Push to Telegram. Record the outcome; never let a send failure lose the store.
  let telegram_ok = false;
  try { await sendMessage(messageText); telegram_ok = true; }
  catch (e) { console.error('telegram send failed:', e.message); }

  // 9. Persist the store (label is top-level, operator-only).
  const data = {
    generated_at: today.toISOString(),
    simulated: true,
    scenario: label,
    scenario_member: targetId,
    members,
    baselines,
    report,
    report_valid,
    eval: evalResult,
    telemetry: { gate_fired, scenario_pool_size, scenario_pool_valid, llm_ms, model, telegram_ok },
  };
  await write(storePath, data);

  return data;
}

// CLI entry — only runs when invoked directly (not when imported by tests).
// pathToFileURL handles Windows/spaces/symlinks correctly (plain `file://` + argv[1] does not).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const llmClient = makeClient(getConfig(env));
  const tgConfig = getTelegramConfig(env);
  const data = await run({
    today: new Date(),
    env,
    scenario: env.SCENARIO || 'auto',      // production default: quiet-by-default gate
    force: env.FORCE_SCENARIO === '1',     // workflow_dispatch sets this to force a scenario
    llmClient,
    sendMessage: (text) => sendTelegram(text, tgConfig),
  });
  console.log(`Wrote data.json — scenario "${data.scenario}", gate_fired=${data.telemetry.gate_fired}, headline: ${data.report?.headline ?? '(unavailable)'}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/run.test.js`
Expected: PASS (15 tests). Then run the whole suite: `node --test` — all green.

- [ ] **Step 5: Commit**

```bash
git add analyst.js tests/run.test.js
git commit -m "feat: orchestration entrypoint (generate→scenario→baseline→analyst→telegram→store)"
```

---

## Task 12: Dashboard (`index.html`)

Self-contained page: reads `data.json`, renders the report at the top, per-member cards with a vs-baseline indicator, and a 30-day trend chart per metric per member with a shaded baseline band. Uses the **baselines from `data.json`** (never recomputes).

**Files:**
- Create: `index.html`
- Manual verification (no unit test — it's a static page).

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Family Health Analyst</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root { --bg:#0f1115; --card:#1a1d24; --ink:#e7e9ee; --muted:#9aa3b2; --green:#3fb950; --amber:#d29922; --grey:#6e7681; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, sans-serif; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sim { color: var(--amber); font-size: 13px; margin-bottom: 20px; }
  .report { background: var(--card); border-radius: 12px; padding: 18px 20px; margin-bottom: 24px; }
  .report h2 { margin: 0 0 10px; font-size: 18px; }
  .rmember { padding: 8px 0; border-top: 1px solid #2a2e37; }
  .rmember:first-of-type { border-top: 0; }
  .status { font-weight: 600; }
  .s-all_clear { color: var(--green); } .s-worth_noting { color: var(--amber); } .s-no_data { color: var(--grey); }
  .signals { color: var(--muted); font-size: 13px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px,1fr)); gap: 18px; }
  .card { background: var(--card); border-radius: 12px; padding: 16px; }
  .card h3 { margin: 0 0 12px; }
  .metric-row { display:flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .chart-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  canvas { background:#0c0e12; border-radius:8px; padding:4px; }
  footer { color: var(--muted); font-size: 12px; margin-top: 28px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Family Health Analyst</h1>
  <div class="sim" id="sim"></div>
  <div class="report" id="report">Loading…</div>
  <div class="cards" id="cards"></div>
  <footer id="footer"></footer>
</div>
<script type="module">
const METRICS = ['rhr','sleep_eff','steps','hrv'];
const META = {
  rhr:{label:'Resting HR',unit:'bpm',better:'lower'},
  sleep_eff:{label:'Sleep eff.',unit:'%',better:'higher'},
  steps:{label:'Steps',unit:'',better:'higher'},
  hrv:{label:'HRV',unit:'ms',better:'higher'},
};
const COLOR = { all_clear:'#3fb950', worth_noting:'#d29922', no_data:'#6e7681' };

function z(v, b){ if(v==null||!b||b.mean==null) return null; if(!b.std) return 0; return (v-b.mean)/b.std; }
function dotColor(zv){ if(zv==null) return '#6e7681'; const a=Math.abs(zv); return a<1.5?'#3fb950':a<2.5?'#d29922':'#f85149'; }

const data = await fetch('data.json').then(r=>r.json());

// Simulated banner
document.getElementById('sim').textContent = data.simulated ? '⚠︎ Synthetic demo data — not real health measurements.' : '';

// Report block
const rep = data.report;
document.getElementById('report').innerHTML = `
  <h2>${rep.headline} <span style="color:var(--muted);font-weight:400">— ${rep.date}</span></h2>
  ${rep.members.map(m=>`
    <div class="rmember">
      <span class="status s-${m.status}">${m.name}: ${m.status.replace('_',' ')}</span> — ${m.summary}
      ${m.changed_signals?.length?`<div class="signals">signals: ${m.changed_signals.join(', ')}</div>`:''}
      ${m.suggestion?`<div class="signals">↳ ${m.suggestion}</div>`:''}
    </div>`).join('')}
`;

// Member cards + charts
const cards = document.getElementById('cards');
for (const mem of data.members){
  const base = data.baselines[mem.id];
  const card = document.createElement('div');
  card.className='card';
  const rows = METRICS.map(metric=>{
    const v = mem.today ? mem.today[metric] : null;
    const zv = z(v, base[metric]);
    const shown = v==null ? '—' : v;
    return `<div class="metric-row"><span><span class="dot" style="background:${dotColor(zv)}"></span>${META[metric].label}</span>
      <span>${shown} ${META[metric].unit} ${zv==null?'':`(${zv>=0?'+':''}${zv.toFixed(1)}σ)`}</span></div>`;
  }).join('');
  card.innerHTML = `<h3>${mem.name}${mem.today?'':' <span style="color:var(--grey);font-size:13px">(no sync today)</span>'}</h3>
    ${rows}<div class="chart-grid">${METRICS.map(m=>`<canvas id="c-${mem.id}-${m}" height="120"></canvas>`).join('')}</div>`;
  cards.appendChild(card);

  // build charts after the canvases are in the DOM
  for (const metric of METRICS){
    const series = [...mem.history, ...(mem.today?[mem.today]:[])];
    const labels = series.map(d=>d.date.slice(5));
    const values = series.map(d=>d[metric]);
    const b = base[metric];
    const band = (k)=> labels.map(()=> b.mean==null?null : b.mean + k*b.std);
    new Chart(document.getElementById(`c-${mem.id}-${metric}`), {
      type:'line',
      data:{ labels, datasets:[
        { label:'+1σ', data:band(1), borderWidth:0, pointRadius:0, fill:'+1' , backgroundColor:'rgba(88,166,255,0.10)'},
        { label:'-1σ', data:band(-1), borderWidth:0, pointRadius:0, fill:false },
        { label:META[metric].label, data:values, borderColor:'#58a6ff', borderWidth:2, pointRadius:1, tension:0.25, spanGaps:true },
      ]},
      options:{ plugins:{legend:{display:false}, title:{display:true,text:META[metric].label,color:'#9aa3b2'}},
        scales:{ x:{ticks:{color:'#6e7681',maxTicksLimit:6}}, y:{ticks:{color:'#6e7681'}} } }
    });
  }
}

document.getElementById('footer').textContent =
  `Generated ${data.generated_at} · scenario (operator view): ${data.scenario}`;
</script>
</body>
</html>
```

- [ ] **Step 2: Generate a sample `data.json` for local viewing**

Create a tiny throwaway script (do not commit it) so the page has data without calling the LLM:

```bash
node -e "
import('./src/generator.js').then(async ({generateNormalData})=>{
  const {computeBaseline}=await import('./src/baseline.js');
  const {applyPerturbations}=await import('./src/scenarios.js');
  const {writeStore}=await import('./src/store.js');
  const today=new Date('2026-06-03T12:00:00Z');
  const members=generateNormalData({today,days:30,baseSeed:7});
  applyPerturbations(members[1],[{offset:0,deltas:{rhr:8,hrv:-12,sleep_eff:-9}}]);
  const baselines=Object.fromEntries(members.map(m=>[m.id,computeBaseline(m.history)]));
  const report={date:'2026-06-03',headline:'Three steady, one worth a check-in.',members:[
    {name:'Alex',status:'all_clear',summary:'Within range.',changed_signals:[],suggestion:null},
    {name:'Sam',status:'worth_noting',summary:'RHR up while HRV and sleep dropped — reads like poor recovery.',changed_signals:['rhr +2.6σ','hrv -2.1σ','sleep_eff -2.0σ'],suggestion:'An easy day; mention to a doctor if it persists.'},
    {name:'Priya',status:'all_clear',summary:'Within range.',changed_signals:[],suggestion:null}]};
  await writeStore('data.json',{generated_at:today.toISOString(),simulated:true,scenario:'poor_recovery',scenario_member:'m2',members,baselines,report});
  console.log('sample data.json written');
});
"
```

- [ ] **Step 3: Serve and verify visually**

Run: `npm run serve` then open `http://localhost:8080`.
Expected: synthetic-data banner; report block with Sam flagged amber; three member cards; each metric shows a value + σ; four trend charts per member with a shaded baseline band; Sam's RHR line spikes above the band on the last day.

- [ ] **Step 4: Commit** (commit `index.html` and the demo `data.json`)

```bash
git add index.html data.json
git commit -m "feat: self-contained dashboard (cards + trend charts + baseline band)"
```

---

## Task 13: GitHub Actions scheduler (`.github/workflows/daily.yml`)

Daily run (07:00 MYT = 23:00 UTC), manual trigger, commits `data.json` back, writes permission set.

**Files:**
- Create: `.github/workflows/daily.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: daily-analyst
on:
  schedule:
    - cron: '0 23 * * *'   # 23:00 UTC = 07:00 MYT (UTC+8)
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Scenario (all_normal | stale_data | llm)'
        default: 'all_normal'
      seed:
        description: 'Seed'
        default: '1'

permissions:
  contents: write

jobs:
  analyst:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: node analyst.js
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GEMINI_MODEL: ${{ secrets.GEMINI_MODEL }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          SCENARIO: ${{ github.event.inputs.scenario || 'all_normal' }}
          SEED: ${{ github.event.inputs.seed || '1' }}
      - name: Commit data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data.json
          git commit -m "data: daily report $(date -u +%Y-%m-%d)" || echo "no changes"
          git push
```

- [ ] **Step 2: Verify the workflow file parses**

Run: `node -e "import('node:fs').then(f=>console.log(f.readFileSync('.github/workflows/daily.yml','utf8').includes('node analyst.js')))"`
Expected: prints `true`. (Real cron/secret execution is validated on GitHub after pushing — see README setup steps.)

- [ ] **Step 3: Write `README.md` with setup + demo script**

```markdown
# Family Health Analyst

A low-noise morning health signal for your family: most mornings it just says everyone's steady;
when several of someone's signals move together, it gives you a gentle heads-up. An LLM "analyst"
reads each person's wearable data against their own baseline, writes a daily report to Telegram, and
a static dashboard drills into the same data. **All data is currently synthetic** (see "Make it real"
below — the harness runs daily regardless). The analyst sees only each person's numbers and personal
baseline, never the injected scenario — the `scenario` field in `data.json` is the answer key.

## Setup
1. `npm install`
2. Copy `.env.example` → `.env`, fill `GEMINI_API_KEY` (https://aistudio.google.com/apikey),
   `TELEGRAM_BOT_TOKEN` (BotFather), `TELEGRAM_CHAT_ID`.
3. `node --env-file=.env analyst.js` — generates data, runs the analyst, pushes to Telegram, writes `data.json`.
4. `npm run serve` → open http://localhost:8080 for the dashboard.

## Demo script
- `SCENARIO=all_normal node --env-file=.env analyst.js` → quiet-day report (proves restraint).
- `SCENARIO=llm node --env-file=.env analyst.js` → LLM-generated anomaly; the analyst infers it from
  numbers alone (it was never told the label — see `scenario` field in `data.json` for the answer key).
- `SCENARIO=stale_data node --env-file=.env analyst.js` → analyst notices the missing member.
Open the dashboard alongside to drill into the flagged member.

## Deployment
- Set repo **Settings → Secrets and variables → Actions**: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID` (optional `GEMINI_MODEL`).
- Enable **Settings → Pages** (deploy from `main`, root). Dashboard at `https://<user>.github.io/<repo>/`.
- `.github/workflows/daily.yml` runs daily (23:00 UTC = 07:00 MYT) and on manual dispatch; commits `data.json`.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/daily.yml README.md
git commit -m "ci: daily scheduled analyst workflow + README"
```

- [ ] **Step 5: Final full-suite check**

Run: `node --test`
Expected: all suites PASS.

---

## Task 14 (OPTIONAL): Weekly report variant

A second scheduled job comparing this week to last week — demonstrates the analyst referencing its own prior outputs.

**Files:**
- Create: `src/weekly.js`, `tests/weekly.test.js`
- Modify: `analyst.js` (add `MODE=weekly` branch), `.github/workflows/weekly.yml`

- [ ] **Step 1: Write the failing test**

```js
// tests/weekly.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyAverages, buildWeeklyPrompt } from '../src/weekly.js';
import { METRICS } from '../src/metrics.js';

const day = (date, rhr) => ({ date, rhr, sleep_eff: 88, steps: 8000, hrv: 55 });

test('weeklyAverages splits last 7 vs prior 7 and averages per metric', () => {
  const history = Array.from({ length: 14 }, (_, i) => day(`d${i}`, 60 + (i < 7 ? 0 : 4)));
  const { thisWeek, lastWeek } = weeklyAverages(history);
  for (const m of METRICS) { assert.ok(thisWeek[m] != null); assert.ok(lastWeek[m] != null); }
  assert.ok(thisWeek.rhr > lastWeek.rhr, 'recent week rhr higher');
});

test('buildWeeklyPrompt has no scenario label and asks for week-over-week reasoning', () => {
  const members = [{ name: 'Alex', history: Array.from({length:14},(_,i)=>day(`d${i}`,60)) }];
  const p = buildWeeklyPrompt(members);
  assert.ok(/week/i.test(p));
  assert.ok(!p.includes('poor_recovery'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly.test.js`
Expected: FAIL — cannot find module `../src/weekly.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/weekly.js
import { METRICS } from './metrics.js';
import { mean } from './baseline.js';

const avg = (days, metric) => mean(days.filter((d) => d && d[metric] != null).map((d) => d[metric]));

// Compare the most recent 7 days to the 7 days before that.
export function weeklyAverages(history) {
  const recent = history.slice(-7);
  const prior = history.slice(-14, -7);
  const pack = (days) => Object.fromEntries(METRICS.map((m) => [m, avg(days, m)]));
  return { thisWeek: pack(recent), lastWeek: pack(prior) };
}

export function buildWeeklyPrompt(members) {
  const people = members.map((m) => ({ name: m.name, ...weeklyAverages(m.history) }));
  return `You are a family health analyst writing a WEEKLY summary. For each person you are given this
week's vs last week's average per metric (rhr, sleep_eff, steps, hrv). Describe week-over-week TRENDS
relative to the person — improving, steady, or worth a check-in. Never diagnose or alarm; data is synthetic.

DATA:
${JSON.stringify(people, null, 2)}

Respond with JSON: { "date": string, "headline": string, "members": [ { "name": string, "trend": "improving"|"steady"|"worth_noting", "summary": string } ] }.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/weekly.js tests/weekly.test.js
git commit -m "feat: optional weekly week-over-week report"
```

---

## Task 15 (OPTIONAL, last): Real reader stub

A documented stub showing where a real Health Connect / HealthKit reader plugs in, emitting the **same Member shape**. Demonstrates the plumbing without sinking effort into device integration.

**Files:**
- Create: `src/realReader.js`, `tests/realReader.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/realReader.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReading } from '../src/realReader.js';
import { METRICS } from '../src/metrics.js';

test('normalizeReading maps a raw device sample into our day shape', () => {
  const raw = { day: '2026-06-03', restingHeartRate: 59, sleepEfficiency: 91, stepCount: 9100, hrvMs: 64, extra: 'ignored' };
  const out = normalizeReading(raw);
  assert.equal(out.date, '2026-06-03');
  for (const m of METRICS) assert.ok(m in out);
  assert.equal(out.rhr, 59);
  assert.equal(out.steps, 9100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/realReader.test.js`
Expected: FAIL — cannot find module `../src/realReader.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/realReader.js
// STUB: a real Health Connect (Android) / HealthKit (iOS) export is on-device only.
// An on-device app would POST samples in some raw shape; this maps one sample to our day entry.
// Wire a real source here later; the rest of the pipeline is unchanged.
export function normalizeReading(raw) {
  return {
    date: raw.day,
    rhr: raw.restingHeartRate ?? null,
    sleep_eff: raw.sleepEfficiency ?? null,
    steps: raw.stepCount ?? null,
    hrv: raw.hrvMs ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/realReader.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/realReader.js tests/realReader.test.js
git commit -m "feat: real-reader stub (same data shape) for future device integration"
```

---

## Self-Review (performed against the spec)

**Spec coverage:**
- Synthetic generator w/ per-person means, wobble, correlated signals → Task 4. ✅
- Fixed `all_normal` + `stale_data` always available → Task 5 (`FIXED_SCENARIOS`, `applyStaleData`). ✅
- Open-ended LLM scenarios, non-emergency, one member targeted → Task 7 + validation Task 5. ✅
- **Information barrier** (label never reaches analyst) → enforced + tested in Tasks 9 and 11. ✅
- **Shared baseline, single source** → `src/baseline.js` (Task 3), computed once in `run` and written to `data.json`; dashboard reads it (Task 12). ✅
- Analyst: baseline-relative, multi-signal synthesis, structured output incl. "all clear", safety framing → Task 9 prompt + schema. ✅
- Telegram via fetch, secrets from env → Task 10 + Task 13. ✅
- Dashboard: cards w/ vs-baseline indicator, 30-day charts, baseline band, report at top, simulated note → Task 12. ✅
- Gemini free tier, `gemini-2.5-flash` default, model+key swappable via env → Task 6. ✅
- GitHub Actions cron (23:00 UTC = 07:00 MYT) + manual dispatch + `contents: write` + commit back; Pages serving `index.html` → Task 13. ✅
- Optional weekly variant → Task 14; optional real reader → Task 15. ✅
- Demo script + synthetic-data disclosure → README (Task 13) + banner (Task 12) + telegram footer (Task 10). ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"write tests for the above" — every code step shows full code. ✅

**Type consistency:** Metric keys `rhr|sleep_eff|steps|hrv` come only from `src/metrics.js`. Member shape `{id,name,history,today}`, baseline shape `{mean,std}`, store shape, and AnalystReport shape are identical everywhere they appear (Data Contracts ↔ Tasks 4/9/11/12). `computeBaseline`, `zScore`, `applyPerturbations`, `applyStaleData`, `generateScenarioPool`, `pickScenario`, `runAnalyst`, `formatReport`, `sendTelegram`, `writeStore`, `run` signatures match across producer and consumer tasks. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-03-family-health-analyst.md`.
</content>
</invoke>
