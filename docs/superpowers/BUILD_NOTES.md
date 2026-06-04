# Build Notes — Family Health Analyst

Autonomous subagent-driven build of `2026-06-03-family-health-analyst.md`.
Branch: `build/family-health-analyst`. **Status: COMPLETE — all 13 core tasks built, 58/58 tests pass.**

## ✅ Things YOU need to do (none blocked the build — code is built & tested without them)

These are runtime credentials/config only.

1. **Gemini API key** (free, no card): https://aistudio.google.com/apikey → `.env` `GEMINI_API_KEY=...`
   (default model `gemini-2.5-flash`).
2. **Telegram bot + chat id:**
   - @BotFather → `/newbot` → copy token → `.env` `TELEGRAM_BOT_TOKEN=...`
   - Message your bot once, open `https://api.telegram.org/bot<TOKEN>/getUpdates`, copy
     `result[].message.chat.id` → `.env` `TELEGRAM_CHAT_ID=...` (groups use a NEGATIVE id).
   - `npm run telegram:test` → should send "Setup works!".
3. **First local run:** `cp .env.example .env`, fill the keys, then `node --env-file=.env analyst.js`.
   Then `npm run serve` → http://localhost:8080 (add `?operator=1` to see the answer key).
4. **Deploy (optional):** create a GitHub repo + remote, **merge `build/family-health-analyst` → main**
   and push, enable **GitHub Pages** (needs a **public** repo, or GitHub Pro), and add
   `GEMINI_API_KEY` / `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` as **Actions secrets**.

## How to review/keep the work
The build lives on branch **`build/family-health-analyst`** (15 commits, one per task + docs).
`main` only has the planning docs. To adopt it: `git checkout main && git merge build/family-health-analyst`.

## FYIs
- Project `.npmrc` (public npm registry) committed — your global npm points at a private Storehub
  registry that 404s on `@google/genai`. Harmless; delete if undesired.
- `@google/genai` pinned to `1.7.0`, installs clean.
- `npm start` runs `node analyst.js` WITHOUT loading `.env`; use `node --env-file=.env analyst.js`
  (as the README says) or `npm run telegram:test` which already loads `.env`.

## Materialization notes (build hardening beyond the literal plan)
During the build I folded several Review-Revisions directives that were still prose-only into the
actual code (the re-review's "spec-implementation drift"), and fixed two genuine plan bugs:
- **Task 6** `generateJson`: added `stripFence` + one retry (revision #9) + a unit test.
- **Task 7** test: fixed `pickScenario(pool,5)` → `3` (5%3≠0; the wrap assertion was wrong).
- **Task 11** `run()`: was the un-materialized old version — rewrote to the revised contract
  (date-hash seed/target rotation, clean-baseline ordering, `shouldFireScenario` gate,
  `validateReport`→fallback, scenario-family-aware `evalReport`, telemetry, `pathToFileURL` entry).
- **Task 12** `index.html`: materialized the dashboard directives — guarded fetch + error/day-zero
  state, single status encoding (dropped the 3rd red dot tier) + non-color cues, `spanGaps:false`,
  operator-gated footer (`?operator=1`), flagged-member sort/border, and FIXED a real bug
  (`changed_signals` are now `{metric,z,phrase}` objects — old code rendered `[object Object]`).
- **Task 13** `daily.yml`: added the `node --test` gate, `concurrency`, `git pull --rebase`,
  narrowed commit guard / `if: success()`, and switched env to `SCENARIO=auto`/`FORCE_SCENARIO`.
- `.env.example`: `SCENARIO=auto` + `FORCE_SCENARIO` (dropped the unused `SEED`).
- **NOTE:** the plan's Task 12 / Task 13 code *blocks* are now superseded by the actual
  `index.html` / `.github/workflows/daily.yml` files (materialized directly).

## Verification
- `node --test` → **58/58 pass** (incl. info-barrier, clean-baseline, cadence-gate 8–18% band,
  validate→fallback, family-aware eval).
- End-to-end `run()` probe confirmed the written `data.json` shape matches what `index.html` reads,
  and that the scenario label never enters `members[]` (barrier holds).
- NOT exercised (needs your keys): the live `node analyst.js` path (real Gemini + Telegram).

## Optional tasks NOT built (explicitly OPTIONAL in the plan)
- Task 14 — weekly report variant.
- Task 15 — real-data reader stub (the "make it real" graduation path).

## Task status
- [x] Task 0 — scaffold · [x] 1 RNG · [x] 2 metrics · [x] 3 baseline · [x] 4 generator
- [x] 5 scenarios · [x] 6 llm · [x] 7 scenario-gen · [x] 8 store · [x] 9 analyst
- [x] 10 telegram · [x] 11 orchestration · [x] 12 dashboard · [x] 13 actions+README
