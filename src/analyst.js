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
