# Family Health Analyst

A low-noise morning health signal for your family: most mornings it just says everyone's steady;
when several of someone's signals move together, it gives you a gentle heads-up. An LLM "analyst"
reads each person's wearable data against their **own** baseline, writes a daily report to Telegram,
and a static dashboard drills into the same data. **All data is currently synthetic** (see "Make it
real" below — the harness runs daily regardless).

The analyst sees only each person's numbers and personal baseline, **never** the injected scenario —
the `scenario` field in `data.json` is the answer key you can check its work against.

By default the daily run is **quiet**: a scenario is injected on only ~13% of days (a date-seeded
gate), so a flag still means something. Most mornings everyone reads "all clear."

## Setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in:
   - `GEMINI_API_KEY` — free, no card: https://aistudio.google.com/apikey
   - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` — see below.
3. `npm run telegram:test` — sends "Setup works!" to your chat. Green light before trusting the daily job.
4. `node --env-file=.env analyst.js` — generates data, runs the analyst, pushes to Telegram, writes `data.json`.
5. `npm run serve` → open http://localhost:8080 for the dashboard.

### Get your Telegram chat id

The chat id is the one non-obvious setup step:

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the **bot token** into
   `TELEGRAM_BOT_TOKEN`.
2. **Send your new bot any message** (it must receive at least one message first).
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser (substitute your token).
4. Copy `result[].message.chat.id` into `TELEGRAM_CHAT_ID`.
   - For a **group** chat, add the bot to the group, send a message there, and use the **negative**
     id (e.g. `-1001234567890`).

## Demo script

The cadence gate only applies to `SCENARIO=auto`. Force a specific scenario to demo:

- `SCENARIO=all_normal node --env-file=.env analyst.js` → quiet-day report (proves restraint).
- `SCENARIO=llm node --env-file=.env analyst.js` → an LLM-generated anomaly; the analyst infers it
  from the numbers alone (it was never told the label — check the `scenario` field in `data.json`
  for the answer key, and `eval.detected` for whether it caught the right person).
- `SCENARIO=stale_data node --env-file=.env analyst.js` → the analyst notices the missing member.

Open the dashboard alongside to drill into the flagged member. Add `?operator=1` to the dashboard
URL to reveal the operator answer key (hidden from the casual family view).

## Make it real

The harness is real and runs daily; only the data source is synthetic. To graduate, replace
`generateNormalData` with a reader that pulls each person's real wearable history (the rest of the
pipeline — baselines, analyst, barrier, dashboard — is unchanged).

## Deployment

- Set repo **Settings → Secrets and variables → Actions**: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID` (optional `GEMINI_MODEL`).
- Enable **Settings → Pages** (deploy from your default branch, root). The dashboard serves at
  `https://<user>.github.io/<repo>/`. **Pages requires a public repo** (or GitHub Pro for a private one).
- `.github/workflows/daily.yml` runs daily (23:00 UTC = 07:00 MYT, best-effort timing) and on manual
  dispatch; it runs the test suite, then the analyst, then commits `data.json` back.
