# Family Health Analyst — Product Guide

> Knowledge base for the chatbot. Use this to answer questions about **what this product is,
> how it works, and what it does and doesn't do.** Written in plain language — quote or
> paraphrase freely. If a question goes beyond what's here, say so honestly rather than guessing.

---

## In one sentence

**Family Health Analyst is a low-noise daily health check for your whole family.** Most mornings
it simply tells you everyone is steady; on the rare day when several of someone's wearable signals
move together, it gives you one gentle heads-up — delivered to Telegram, with a dashboard to drill in.

---

## What it is

A small, automated tool that reads each family member's wearable data (resting heart rate, sleep
efficiency, steps, heart-rate variability) once a day and writes a short, calm "daily health report."

- An **LLM "analyst"** (Google's Gemini 2.5 Flash) reads each person's numbers against **their own
  personal baseline** — not generic health norms — and writes the report.
- The report is pushed to **Telegram** each morning, and a **static web dashboard** lets you drill
  into the same data per person.
- It's designed to be **a family daily-glance tool**, not a medical device and not a dashboard you
  have to babysit. The whole point is that it stays quiet until something is genuinely worth a look.

### Who it's for
A family that wants a gentle, shared morning signal — "is everyone okay?" — without alarms, jargon,
or constant notifications. One person (the "operator") sets it up; the rest of the family just reads
the morning message.

---

## How it works (the daily flow)

1. **Collect** — For each member, the system loads ~30 days of daily wearable readings.
   - Synthetic members use generated data.
   - Real members (currently "Me", via an **Apple Watch**) push their day's numbers through an
     iOS "Daily Feed" Shortcut that commits the data to the repo; the pipeline ingests it nightly.
2. **Baseline** — For each person and each metric, it computes that person's **own** normal: the
   mean and standard deviation of their recent history. "Normal" is defined per person, not globally.
3. **Analyze** — Once a day, it sends each person's baseline + last 7 days + today's values to the
   LLM analyst. The analyst:
   - Judges every value **relative to that person's own baseline**.
   - **Synthesizes across signals** — one metric being slightly off is treated as noise; the
     interesting cases are when *several* signals move together (e.g. resting HR up while HRV and
     sleep efficiency drop, which reads like poor recovery or oncoming illness).
   - Marks each person `all_clear` 🟢, `worth_noting` 🟡, or `no_data` ⚪️, with a one–two sentence
     summary and, when relevant, a gentle suggestion.
4. **Deliver** — The result is rendered as plain text and sent to **Telegram**, and `data.json` is
   updated so the **dashboard** reflects the latest day. The run happens once a day, around **10pm
   local**, after the day's data is in.

### Quiet by default
The daily run is intentionally calm. On synthetic/demo data, an "interesting" scenario is injected
on only **~13% of days** (a date-seeded gate), so most mornings everyone reads "all clear." This is
deliberate: if a 🟡 showed up every day, it would mean nothing. A flag only appears when it's earned.

### What the family sees vs. the operator
- **Family-facing (Telegram + default dashboard):** plain language only — e.g. "resting heart rate
  noticeably higher than usual." No σ, no z-scores, no diagnoses.
- **Operator view:** add `?operator=1` to the dashboard URL to reveal the technical answer key
  (z-scores, and on synthetic data the hidden scenario label used to check the analyst's work).

---

## What it does

- ✅ Gives a **single calm daily summary** of the whole family's wearable signals.
- ✅ Judges each person against **their own baseline**, so "normal" is personalized.
- ✅ **Synthesizes multiple signals** to catch patterns no single threshold would — the reason it
  uses an LLM instead of a simple "if heart rate > X" rule.
- ✅ Stays **quiet on quiet days** — a flag is rare, so it actually means something.
- ✅ Notices when **someone hasn't synced** ("no data") and says how long data has been missing,
  instead of inventing values.
- ✅ Delivers to **Telegram** and provides a **web dashboard** to drill into any member's trend.
- ✅ Supports **real wearable data** (Apple Watch today, via an on-device iOS Shortcut) alongside
  synthetic members.

## What it does NOT do

- ❌ **Not a medical device and not a diagnosis.** It describes patterns and may say "worth a
  check-in" or "worth mentioning to a doctor" — it never says "you have X," never names a condition,
  and never raises an emergency alarm.
- ❌ **Does not use generic health thresholds.** There are no global "healthy" cutoffs anywhere;
  everything is relative to the individual.
- ❌ **Not real-time.** It runs **once a day** (around 10pm local in the current setup), not
  continuously or on-demand alerting.
- ❌ **Does not manufacture concern.** A normal day is reported as a normal day; it won't invent
  problems to seem useful.
- ❌ **Does not pull from a cloud health API.** Apple Watch data has no cloud API, so real data
  comes from an on-device iOS Shortcut the user runs/schedules — not an automatic third-party sync.
- ❌ **Does not track or store medical records, location, or identity** — only the four daily
  wearable metrics per member.
- ❌ It is **mostly synthetic by default.** Out of the box, family members ("Mom," "Dad," "Sister")
  use generated data; one member ("Me") is wired to real Apple Watch data. The harness is real and
  runs daily regardless — only the data source for synthetic members is fake.

---

## The metrics it watches

| Metric | What it is | "Better" direction | A big jump usually means |
|---|---|---|---|
| **Resting heart rate (rhr)** | beats per minute at rest | lower | higher = stress / possible illness |
| **Sleep efficiency (sleep_eff)** | % of time in bed actually asleep | higher | higher = better rest |
| **Steps** | daily step count | higher | higher = more active |
| **Heart-rate variability (hrv)** | ms variation between beats | higher | higher = better recovery |

The analyst looks for these **moving together**, not any one in isolation.

---

## How to join the Telegram group (to get the daily report)

The daily report is posted to a shared **family Telegram group**. To start receiving it:

1. **Install Telegram** (free) on your phone or desktop — [telegram.org](https://telegram.org) — and
   create an account if you don't have one.
2. **Open the family group invite link:**
   👉 **[JOIN LINK — replace with your group's invite URL, e.g. https://t.me/+XXXXXXXXXXXX]**
   Tap it on a device where Telegram is installed, then tap **Join**.
3. That's it — once you're in the group, the report arrives **automatically once a day (around 10pm
   local)**. There's nothing to configure on your end.

**No invite link?** Ask the family operator (the person who set this up) to add you, or to send you
the group's invite link. They can get it in Telegram via the group's name → **Add Members** or
**Invite to Group via Link**.

> Note for the operator: the bot posts to whichever chat is set as `TELEGRAM_CHAT_ID`. For a group,
> add the bot to the group and use the group's (negative) chat id — see `README.md` for the exact steps.

---

## Privacy & safety posture (for reassuring questions)

- Only **four daily numbers per person** are processed — no names beyond a label, no location, no
  raw medical records.
- The analyst is **explicitly instructed never to diagnose or alarm**, only to describe patterns and
  optionally suggest a gentle check-in.
- Real wearable data is pushed by the user's **own device**, on the user's schedule — there's no
  background third-party health-data harvesting.

---

## Quick answers (FAQ the chatbot can reuse)

**"What is this?"** — A calm, once-a-day family health summary. An AI reads each person's wearable
numbers against their own normal and sends one short report to Telegram, with a dashboard to drill in.

**"How does it work?"** — Every day it loads each person's recent wearable data, computes their
personal baseline, asks an LLM to compare today against that baseline (looking for several signals
moving together), and sends a plain-language report. Quiet most days by design.

**"Is it a medical tool / will it diagnose me?"** — No. It only describes patterns and may suggest a
check-in or mentioning something to a doctor. It never diagnoses, never names conditions, never alarms.

**"Is my data real / private?"** — By default most members are synthetic demo data; real Apple Watch
data is supported and is pushed from your own device on your schedule. Only four daily metrics per
person are used — no location, identity, or medical records.

**"How often does it run?"** — Once a day (around 10pm local in the current setup), not real-time.

**"Why an AI instead of simple rules?"** — Because the valuable signal is *combinations* of metrics
moving together relative to a person's own baseline — something rigid thresholds miss.

**"Can I try it?"** — Yes. If you'd like to try it, let me know and I'll email the team to get you
set up. *(This hands off to the chatbot's email-the-team flow.)*

---

*Sources in this repo: `README.md` (overview, setup, "make it real"), `docs/ANALYST.md` (exact
prompt, schema, pipeline), `docs/ONBOARDING.md` (real Apple Watch data flow), `family.json`
(members), `src/` (implementation).*
