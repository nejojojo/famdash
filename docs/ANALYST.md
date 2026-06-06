# How the AI Health Analyst Works

This documents exactly how the daily report is produced today — what the LLM sees,
what it's told to do, and how its answer is turned into the Telegram message. It's
written so you can **edit the prompt below**, hand the edited version back to the LLM,
and know which source file to change to make it stick.

The model is **Gemini 2.5 Flash** (`src/llm.js`), called once per day with
**structured JSON output** (a `responseSchema` it must conform to). There is no
temperature or system/user split configured — it's a single prompt string plus the schema.

---

## 1. Pipeline at a glance

```
family.json ──> load 30 days per member ──> compute personal baseline (mean, std)
                                                   │
                  scenario gate (synthetic only) ──┤  (demo perturbations; ignore for real use)
                                                   ▼
        build prompt (baseline + last 7 days + today, per person)  ──> Gemini 2.5 Flash
                                                   │
                                      validate JSON against schema
                                                   ▼
                          format as plain text  ──>  Telegram
```

Source map:

| Step | File |
|---|---|
| Load + normalize each person's data | `src/sources.js` |
| Baseline math (mean, std, z-score) | `src/baseline.js` |
| **The prompt + schema + reasoning rules** | `src/analyst.js` |
| Metric names / units / direction | `src/metrics.js` |
| Render report → Telegram text | `src/telegram.js` |
| Orchestration (the daily run) | `analyst.js` (repo root) |

---

## 2. What the analyst actually sees

The LLM does **not** see raw 30-day history. For each person it gets a compact block
(`buildMemberContext` in `src/analyst.js`):

```json
{
  "name": "Mum",
  "synced_today": true,
  "baseline": {
    "rhr":       { "mean": 58.4, "std": 2.1 },
    "sleep_eff": { "mean": 90.2, "std": 2.6 },
    "steps":     { "mean": 8200, "std": 1500 },
    "hrv":       { "mean": 62.0, "std": 5.1 }
  },
  "recent_days": [ /* the last 7 days incl. today, each {date, rhr, sleep_eff, steps, hrv} */ ],
  "today":       { "date": "2026-06-05", "rhr": 64.1, "sleep_eff": 86.0, "steps": 7100, "hrv": 54.0 }
}
```

Key facts about this context:

- **Baseline = the person's own trailing history** (the ~29 days *before* today), computed
  per metric as `mean` and sample standard deviation (`std`). Null/missing days are dropped.
  See `computeBaseline` in `src/baseline.js`.
- **`recent_days`** is the last **7** days including today (`recentWindow(member, n = 7)`).
  Change the `7` there to widen/narrow the window the model sees.
- **People who didn't sync today are still included**, but with `today: null` and
  `synced_today: false` — *unless* they are a real member with no data at all, who are
  filtered out before prompting (`prompted = members.filter(m => m.today != null)` in
  `analyst.js`). (Synthetic demo members are always shown.)
- The block **never contains a diagnosis, a label, or a z-score** — the model is expected
  to derive deviation itself from `today` vs `baseline`.

### The "z-score" the model is asked to report

The model is asked to output a signed `z` per changed signal. That's the standard score:

```
z = (today_value − baseline.mean) / baseline.std
```

(`zScore` in `src/baseline.js` — provided as the definition; the model computes its own
from the numbers it's given.) `z = +2.4` means "2.4 standard deviations above this person's
normal." Direction of *concern* depends on the metric (see `better` in `src/metrics.js`):

| Metric | Unit | "Better" direction | High z usually means |
|---|---|---|---|
| `rhr` (resting HR) | bpm | lower | worse (stress / illness) |
| `sleep_eff` (sleep efficiency) | % | higher | better |
| `steps` | steps | higher | more active |
| `hrv` (heart-rate variability) | ms | higher | better recovery |

---

## 3. THE PROMPT (this is the part you edit)

This is the system instruction sent to Gemini. **This block IS the live prompt** — `src/analyst.js`
reads the text between the two sentinel comments below at runtime (`loadSystemPrompt`), so
**editing the text inside the fence changes the analyst's behavior directly**, no code change needed.

Edit only the text *inside* the fence. Do not remove the `<!-- ANALYST_PROMPT_START -->` /
`<!-- ANALYST_PROMPT_END -->` markers or the ```` ``` ```` fence — they're how the loader finds the prompt.
(Avoid putting a triple-backtick inside the prompt itself.)

<!-- ANALYST_PROMPT_START -->
```text
You are a careful family health analyst reviewing wearable data.
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
summarizing the whole family and the date.
```
<!-- ANALYST_PROMPT_END -->

After this text, the prompt appends a metric legend, the JSON data block (section 2), and
`Respond ONLY with JSON matching the required schema.` (see `buildPrompt`).

### The three behavioral levers in that prompt

1. **Relative, not absolute** — everything is judged against the person's own baseline. There
   are no global "healthy" thresholds anywhere in the code.
2. **Synthesis over thresholds** — the model is explicitly told that one metric off is noise,
   and that *co-moving* signals are the signal. This is the whole point of using an LLM here
   instead of a simple `if z > 2` rule.
3. **Quiet by default + safety rails** — "a quiet day should read as a quiet day," never
   diagnose, never alarm. This keeps the family feed calm so a 🟡 actually means something.

---

## 4. What the model must return (output schema)

Enforced two ways: Gemini's `responseSchema` (`ANALYST_SCHEMA`) on the wire, and
`validateReport` after parsing. Shape:

```json
{
  "date": "2026-06-05",
  "headline": "Quiet day across the family — everyone within their normal range.",
  "members": [
    {
      "name": "Mum",
      "status": "all_clear",              // 'all_clear' | 'worth_noting' | 'no_data'
      "summary": "All steady today.",      // 1–2 sentences
      "changed_signals": [                 // [] when all clear
        { "metric": "rhr", "z": 2.4, "phrase": "resting heart rate noticeably higher than usual" }
      ],
      "suggestion": ""                     // "" means no suggestion (never null, never omitted)
    }
  ]
}
```

`validateReport` (`src/analyst.js`) rejects the report if: it's not an object, `date`/`headline`
are missing, the member count doesn't match who was asked about, a name is unexpected,
`status` is outside the enum, or `changed_signals`/`suggestion` are the wrong type. A rejected
report is **not sent** — the family gets a neutral "report unavailable today" message instead
(`analyst.js`).

---

## 5. How the report becomes the Telegram message

`formatReport` (`src/telegram.js`) renders plain text (no Markdown, so stray characters in
LLM free text can't break delivery). Status → icon: `all_clear` 🟢, `worth_noting` 🟡,
`no_data` ⚪️. Layout:

```
<headline>
Daily Health Report — 2026-06-05

🟢 Mum — All steady today.
🟡 Dad — Resting HR up while HRV and sleep dipped; reads like poor recovery.
   resting heart rate noticeably higher than usual; HRV lower than usual
   ↳ Might be worth an early night and a check-in tomorrow.
```

Only the **plain-language `phrase`** of each changed signal is shown to the family — never the
raw `rhr +2.4σ`. The `suggestion` renders as an `↳` line, and is omitted entirely when empty.
(If `simulated` is true, a "synthetic demo data" disclaimer is prepended as the first line.)

---

## 6. Editing cheat-sheet

| To change… | Edit |
|---|---|
| The analyst's reasoning / tone / safety rules | The fenced prompt block in **this file**, section 3 (loaded by `src/analyst.js` at runtime) |
| How many recent days the model sees | `recentWindow(member, n = 7)` in `src/analyst.js` |
| How long the baseline window is | `days` arg in `analyst.js` (`loadMemberData(..., { days: 30 })`) |
| Which metrics exist (add/remove) | `src/metrics.js` — then `RANGES`/null-rows in `src/sources.js` |
| The output fields the model must produce | `ANALYST_SCHEMA` **and** `validateReport` in `src/analyst.js` |
| Status icons / Telegram layout | `src/telegram.js` |
| The model used | `GEMINI_MODEL` env var / default in `src/llm.js` |

> ⚠️ Output shape is enforced in **two** places. If you add or rename a field, change both
> `ANALYST_SCHEMA` (what Gemini is allowed to return) and `validateReport` (what we accept),
> or valid reports will be silently dropped.
