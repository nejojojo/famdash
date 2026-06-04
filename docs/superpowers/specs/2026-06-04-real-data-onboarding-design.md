# Real-Data Onboarding — Design Spec (2026-06-04)

## Context

`famdash` currently runs a synthetic-only family health pipeline: three hard-coded members
(`PROFILES` in `src/metrics.js` — Mom/Dad/Sister), a daily GitHub Action that generates data,
runs the LLM analyst, pushes a Telegram report, writes `data.json`, and archives 30 days of
history; a public GitHub Pages dashboard renders it.

We want members to optionally connect **real wearable data** (starting with the operator, "Me",
as a 4th member) while the rest stay synthetic — and a repeatable way to **onboard** a person's
real feed. Apple Health / Google Health Connect have **no cloud API** (on-device only), so real
data reaches the pipeline via a per-person **feed file** that the person's phone pushes into the
repo.

**Scope decision:** one family, **demo-first**, designed to be *forward-compatible* (the shape
should tell a multi-tenant story without building it). Explicitly **out of scope:** multi-tenant
SaaS, auth/private hosting, DB, LLM PII-pseudonymization, and wearable cloud APIs (Fitbit/Oura) —
all noted as future work, none built now.

**Chosen mechanism (Route B):** a member's real data is produced by an Apple **Shortcut** that
reads HealthKit and commits `feeds/<id>.json` to this repo via the GitHub API on a daily
automation. The pipeline reads that committed file. (A `feedUrl`/`feedEnv` seam is left in the
config so "Route A" — export-to-URL — can be added later without code changes.)

## Goal

Mixed synthetic + real members in one family, config-driven, with a tangible onboarding path
(guide + feed validator). Real data is read-only; synthetic demo scenarios never touch real
members; a member with no feed yet degrades gracefully to "no data".

## Data model

**`family.json`** (committed) — the single registry, replacing `PROFILES`:
```json
{
  "family": "Demo Family",
  "members": [
    { "id": "m1", "name": "Mom",    "source": "synthetic", "means": { "rhr": 58, "sleep_eff": 90, "steps": 9000,  "hrv": 65 } },
    { "id": "m2", "name": "Dad",    "source": "synthetic", "means": { "rhr": 62, "sleep_eff": 86, "steps": 6500,  "hrv": 48 } },
    { "id": "m3", "name": "Sister", "source": "synthetic", "means": { "rhr": 66, "sleep_eff": 88, "steps": 11000, "hrv": 55 } },
    { "id": "me", "name": "Me",     "source": "feed" }
  ]
}
```
- `synthetic` members carry their `means` here (moved out of `src/metrics.js`; `metrics.js` keeps
  `METRICS`/`METRIC_META`/`NOISE`/`roundMetric`).
- `feed` members read **`feeds/<id>.json`** by convention. Optional forward-compat fields
  (not implemented now, just reserved): `feedUrl` / `feedEnv` for Route A.

**Feed contract** — `feeds/<id>.json` (what the Shortcut commits): a JSON array, any order,
~30 days:
```json
[ {"date":"2026-06-04","rhr":58.2,"sleep_eff":91.0,"steps":9034,"hrv":64.7}, ... ]
```

**`data.json` changes:** each member object gains `real: true|false`; top-level `simulated` is
replaced by `has_synthetic: <true if any synthetic member>` (keep `simulated` as an alias for
backward-compat with existing history files).

## Components

### `src/sources.js` (new — the pluggable reader)
- `loadFamily(text) -> { family, members }` — parse + validate `family.json` (ids unique,
  known `source`, synthetic has `means`).
- `loadMemberData(member, { today, days, seed, readFeed }) -> { id, name, real, history, today }`:
  - `synthetic` → `generateMemberSeries(member.means, { today, days, seed })`, `real:false`.
  - `feed` → `readFeed(member)` (default reads `feeds/<id>.json`; **injectable**), normalize to
    the trailing `days` ending at the report date, `real:true`. Absent/empty/malformed/stale feed
    → `today:null` (graceful no-data).
- `SOURCES` dispatch map (`synthetic`, `feed`) so `fitbit`/`oura` can be added later.

### `analyst.js` orchestrator (`run()`) — config-driven
- New injectable deps: `family` (default `loadFamily(<read family.json>)`), `readFeed` (default
  reads `feeds/<id>.json`). Keeps tests pure.
- Build all members via `loadMemberData`; compute **clean baselines** for everyone (real members
  from real history) — unchanged ordering (baselines before any scenario).
- **Scenario targeting restricted to `synthetic` members**: pick the date-rotated target among the
  synthetic subset; real members are never perturbed.
- **Eval over synthetic members only**: detection + false-positives scored across synthetic members
  (no ground truth for real). `evalReport` receives the evaluable (synthetic) name set, or filters
  by the `real` flag.
- Persist `real` per member; set `has_synthetic`.

### Dashboard (`index.html`) + Telegram (`src/telegram.js`) — real/synthetic labeling
- Dashboard: per-card tag **`demo`** vs **`● real`**; banner shown only when `has_synthetic`,
  reworded to "Some members use synthetic demo data."
- Telegram: disclosure line adapts — appended only if `has_synthetic`; all-real → no disclaimer.

### Onboarding (Approach 2)
- **`docs/ONBOARDING.md`** — Route B walkthrough: create a fine-grained GitHub PAT (contents:write,
  this repo only); build the Apple Shortcut (read RHR/HRV/steps/sleep for ~30 days → compute
  `sleep_eff = asleep ÷ in-bed × 100` → format JSON → `PUT` to the GitHub contents API at
  `feeds/<id>.json` with the current file SHA); set a daily 7 a.m. Personal Automation; add the
  person to `family.json`. Includes the JSON contract and troubleshooting.
- **`npm run check-feed -- <id>`** validator — loads `feeds/<id>.json`, asserts: valid array; each
  entry has a `date` + the four numeric metrics; ≥ a minimum number of days; newest date within a
  freshness window. Prints a green/red summary (like `telegram:test`). Pure check function is
  unit-tested; the CLI wrapper prints/exits.

## Data flow

```
Shortcut (daily) ── PUT feeds/me.json ──► repo
                                           │
GitHub Action (daily): checkout ──► run() ─┤ loadFamily(family.json)
                                           │ per member: synthetic→generate | feed→read feeds/<id>.json
                                           │ clean baselines → inject scenario (synthetic only)
                                           │ analyst → validateReport → eval (synthetic only)
                                           │ write data.json (+ real flags) → history/<date>.json
                                           └ Telegram (disclaimer iff has_synthetic)
Pages dashboard ── reads data.json / history/* ── renders cards (demo vs ● real)
```

## Error handling / edge cases
- Absent / empty / malformed `feeds/<id>.json` → that member `today:null` (no-data), logged; the
  validator catches this before it silently appears on the dashboard.
- Stale feed (newest date < report date) → `today:null` → dashboard "last synced N days ago"
  (already supported).
- Missing metric on a day → that metric `null` (baseline/zScore already ignore nulls).
- Member listed in `family.json` with no feed file yet → no-data (lets you pre-register people).
- Real member flagged `worth_noting` by the analyst → shown normally; **not** counted in the demo
  false-positive eval (excluded as real).

## Testing
- `src/sources.js`: synthetic passthrough; feed normalize (order-agnostic, gap-fill,
  missing-today→null); malformed/absent feed → no-data; `loadFamily` validation errors.
- `family.json` schema validation.
- `check-feed` pure validator: well-formed vs each failure mode (bad metric, missing date,
  too few days, stale).
- Updated `run.test.js`: inject a fake `family` + fake `readFeed` → assert scenarios hit only
  synthetic members, eval excludes the real member, a real member flows through with `real:true`,
  and a missing feed degrades that member to no-data. Existing behavior tests adapted to the
  config-driven member list and kept green.

## Out of scope (future)
Multi-tenant/SaaS, authentication, private hosting, a real database, LLM prompt pseudonymization,
and wearable cloud-API sources (Fitbit/Oura) — the `family.json` `source` field + `feedUrl`/`feedEnv`
reservation + the `SOURCES` dispatch are the seams that make these additive later.
