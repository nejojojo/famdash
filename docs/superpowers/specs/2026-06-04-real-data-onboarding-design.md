# Real-Data Onboarding — Design Spec (2026-06-04, rev 2)

> Rev 2 incorporates a 5-lens review (engineering, security, QA, UX, simplicity). Changes:
> added a Privacy & Consent section; scoped real data to the **operator only**; hardened Route B
> (SHA flow, sleep_eff fallback, operator-assembled + prebuilt Shortcut); pinned the
> synthetic-only eval/scenario mechanism, feed normalization, and validator thresholds; trimmed
> the `SOURCES` map, the `has_synthetic` alias, and the reserved `feedUrl/feedEnv` fields; split
> delivery into two phases.

## Context

`famdash` runs a synthetic-only family health pipeline: three hard-coded members (`PROFILES` in
`src/metrics.js` — Mom/Dad/Sister), a daily GitHub Action (generate → Gemini analyst → Telegram →
`data.json` + 30-day `history/`), and a **public** GitHub Pages dashboard. Apple Health / Health
Connect have **no cloud API** (on-device only), so real data reaches the pipeline via a per-person
**feed file** the phone pushes into the repo.

## Goal & scope

Let the **operator add their own real wearable data** as a 4th member ("Me") while Mom/Dad/Sister
stay synthetic — plus a repeatable, validated onboarding path. Demo-first, one family.

**Scope (rev 2):**
- **Only the operator's own data is real.** Onboarding *other people's* real data is **explicitly
  out of scope** (it would require their consent and almost certainly a private repo — see Privacy).
  The code stays general (any member *can* be a `feed`), but the demo and docs cover the operator only.
- Mixed synthetic + real, config-driven; synthetic scenarios never touch real members; a member
  with no/short/stale feed degrades to "no data".
- **Out of scope (future, with reserved seams):** multi-tenant/SaaS, auth, private hosting, a DB,
  LLM prompt pseudonymization, and wearable cloud-API sources (Fitbit/Oura).

**Chosen mechanism (Route B):** an Apple **Shortcut** reads HealthKit and commits `feeds/<id>.json`
to this repo via the GitHub API on a daily automation; the pipeline reads that file.

## Privacy & consent (operator, eyes-open)

The operator explicitly accepts, before enabling a real feed, that:
- Their biometric series (resting HR, HRV, sleep efficiency, steps) and 30 days of it in `history/`
  are committed to a **public** repo and served on a **public** URL — **indexed and irreversible**
  (forks/archives persist even after deletion).
- Real metrics are sent **verbatim to the Gemini API**; the operator should review Google's Gemini
  API data-use terms. Prompt pseudonymization is deferred.
- The **GitHub PAT** used by the Shortcut: fine-grained, **`contents:write` on this repo only**,
  shortest practical expiration, stored in the Shortcut (treat as plaintext — anyone with phone
  access can read it); **revoke immediately** if exposed. Note the PAT can write *any* file in the
  repo (incl. `index.html`/`family.json`), so revocation is the recovery path.

`docs/ONBOARDING.md` opens with a one-screen "read this first" version of the above. The guide does
**not** instruct onboarding other family members' real data; it points out that doing so needs their
consent and a private repo (out of scope here).

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
- `feed` members read **`feeds/<id>.json`**. (No `feedUrl`/`feedEnv` fields now — the `source`
  value is the only seam; URL sources are added when actually built.)

**Feed contract** — `feeds/<id>.json`: a JSON array, any order, ~30 days:
```json
[ {"date":"2026-06-04","rhr":58.2,"sleep_eff":91.0,"steps":9034,"hrv":64.7}, ... ]
```
Any metric may be `null` (e.g. `sleep_eff` if the Shortcut can't compute it that day).

**`data.json` changes:** each member gains `real: true|false` and (real members) a **`feed_state`**:
`"ok"` | `"stale"` | `"never_synced"` | `"error"`. The existing top-level **`simulated`** field is
**redefined** to mean "contains any synthetic member" (true in this demo) — no new field, no alias.

## Components

### `src/sources.js` (new reader)
- `loadFamily(text) -> { family, members }` — minimal fail-fast validation (unique ids; `source` is
  `synthetic`|`feed`; synthetic has a complete `means` with all four metrics). Three checks + a clear
  thrown error; not a schema library.
- `loadMemberData(member, { today, days, seed, readFeed }) -> { id, name, real, history, today, feed_state? }`
  via a **plain conditional** (no dispatch map):
  - `synthetic` → `generateMemberSeries(member.means, { today, days, seed })`, `real:false`.
  - `feed` → `readFeed(member)` (default reads `feeds/<id>.json`; **injectable**), then **normalize**:
    1. drop entries with `date > today` (future) and malformed rows;
    2. **dedupe by date, last-wins** (Shortcut re-run safety);
    3. sort ascending; clamp each metric to a sane range (`rhr 30–200`, `hrv 5–300`,
       `sleep_eff 0–100`, `steps 0–100000`) — out-of-range → `null`;
    4. build the trailing `days` window ending at `today`; `today` = the entry dated `today` (else null).
  - **Degrade rules:** `< MIN_DAYS` (7) valid history days → `feed_state:"never_synced"`, `today:null`;
    feed present but newest date < today → `"stale"`, `today:null`; today present & valid → `"ok"`;
    unreadable/parse error → `"error"`, `today:null`. (Constants `MIN_DAYS=7`, `FRESHNESS_DAYS=2`,
    exported as named constants.)

### `analyst.js` orchestrator (`run()`) — config-driven
- Injectable deps: `family` (default loads `family.json`), `readFeed` (default reads `feeds/<id>.json`).
- Build members via `loadMemberData`; compute **clean baselines** for everyone (real from real history).
- **`syntheticMembers` = members where `source==='synthetic'`.** Scenario target =
  **`dateHash % syntheticMembers.length`** — never a real member. (Defensive: if there are zero
  synthetic members, skip injection; `scenario:"all_normal"`, eval null — not a demo case but handled.)
- **Analyst prompt** includes only members with data (`today != null`); real no-data members are
  **excluded** from the prompt. `validateReport` checks `report.members.length === promptedMembers.length`.
- **`evalReport` takes an allow-list of synthetic member names** and scores detection + false-positives
  only over that set (a real member flagged `worth_noting` is shown but never counted). `evalReport`
  stays ignorant of the `real` flag, so the existing call sites/tests are unaffected (they pass all
  three names).
- Persist `real` + `feed_state` per member; `simulated` = (any synthetic present).

### Dashboard (`index.html`) + Telegram (`src/telegram.js`) — labeling
- Per-card tag: **`demo`** (synthetic) vs **`● real`** (real). A one-line legend explains it.
- Real-member state copy keyed off `feed_state`: `ok` → normal; `stale` → "last synced N days ago";
  `never_synced` → "not synced yet" (distinct from a broken/stale feed); `error` → "feed unreadable".
- Banner shown only when `simulated` (any synthetic): "Some members use synthetic demo data."
- Telegram: disclosure line appended only when `simulated`.

### Onboarding (Approach 2) — operator-assembled
- **`docs/ONBOARDING.md`**: states up front this is **operator-assembled** (you build the PAT +
  Shortcut for yourself; not a self-serve flow). Steps:
  1. Create the fine-grained PAT (Privacy section).
  2. Install the **prebuilt Shortcut** we ship (a `.shortcut`/iCloud link), or build it from the
     documented actions. The Shortcut: read RHR/HRV/steps for ~30 days; compute `sleep_eff` =
     Σasleep ÷ Σin-bed × 100 per night (**if not reliably computable, emit `null`** — the pipeline
     handles null metrics); assemble the JSON; **GET** `feeds/<id>.json` to read its `sha` (404 ⇒
     omit sha on first commit); **PUT** with base64 content + that sha. The GET→PUT SHA step is the
     #1 failure point — documented explicitly, incl. the **422 "sha mismatch"** fix (re-GET each run)
     and single-device-per-person to avoid 409 conflicts.
  3. Add yourself to `family.json`; set a daily 7 a.m. Personal Automation.
  - Note: first-run Shortcut/PAT/SHA debugging is manual/unsupported; the validator only verifies
    *after* a successful first commit.
- **`npm run check-feed -- <id>`** validator (post-setup verification): loads `feeds/<id>.json`,
  asserts valid array; each entry has a `date` + numeric metrics **within the sane ranges**;
  `≥ MIN_DAYS` days; newest date within `FRESHNESS_DAYS`. Prints a green/red summary; **exit 0 on
  pass, non-zero on fail**. Pure check fn unit-tested; CLI exit codes tested via subprocess (like
  `telegram:test`).

## Data flow
```
Shortcut (daily): GET feeds/me.json sha → PUT feeds/me.json ──► repo
GitHub Action (daily): checkout → run():
   loadFamily(family.json) → per member: synthetic→generate | feed→read+normalize feeds/<id>.json
   clean baselines → inject scenario (synthetic subset only) → prompt = members with data
   analyst → validateReport(prompted) → eval(synthetic allow-list)
   write data.json (real + feed_state) → history/<date>.json → Telegram (disclaimer iff simulated)
Pages dashboard ── reads data.json / history/* ── cards (demo vs ● real, feed_state copy)
```

## Acceptance criteria ("Me onboarded")
1. `npm run check-feed -- me` exits 0.
2. Next pipeline run writes `data.json` with `me` having `real:true`, `feed_state:"ok"`, non-null `today`.
3. Dashboard renders the `● real` tag for `me`; `feed_state` copy correct.
4. No regression in the three synthetic members' eval scores.

## Testing
- `src/sources.js`: synthetic passthrough; feed normalize — order-agnostic, **dedupe-by-date
  (last-wins)**, **drop future dates**, gap-fill, **range-clamp out-of-units → null**; the four
  `feed_state` paths (`ok` / `stale` / `never_synced` / `error`) as **separate** tests; `< MIN_DAYS`
  → never_synced.
- `loadFamily`: unique-id, bad-source, and **partial-`means`** (missing one metric) errors.
- `check-feed`: pass case + each failure (bad metric, out-of-range/unit, missing date, too few days,
  stale); CLI exit-code contract via subprocess.
- Updated `run.test.js`: inject a fake `family` + fake `readFeed`; assert scenario targets only
  synthetic members, eval excludes the real member (a `worth_noting` real member is not a false
  positive), a real member flows through with `real:true`/`feed_state:"ok"`, a missing feed degrades
  to no-data, and the fake `llmClient` returns a report matching only the **prompted** (with-data)
  members. Existing behavior tests adapted and kept green.

## Delivery — two phases (per simplicity review)
- **Phase 1 — config refactor (no behavior change):** `family.json` + `src/sources.js` (synthetic
  path only) replace hard-coded `PROFILES`; `run()` builds members from config. **All existing ~58
  tests stay green.** Lowest-risk, isolatable.
- **Phase 2 — real feed:** the `feed` branch + normalization + `feed_state`, scenario/eval
  synthetic-restriction, `check-feed`, dashboard/Telegram labeling, and `docs/ONBOARDING.md` +
  prebuilt Shortcut.

## Out of scope (future seams)
Multi-tenant/SaaS, auth, private hosting, DB, LLM pseudonymization, wearable cloud APIs. The
`family.json` `source` field and the `loadMemberData` conditional are the seams that make these
additive later.
