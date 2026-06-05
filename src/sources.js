// src/sources.js
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { METRICS } from './metrics.js';
import { generateMemberSeries } from './generator.js';

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

export async function readFeedFile(member) {
  return JSON.parse(await readFile(`feeds/${member.id}.json`, 'utf8'));
}

function isoDay(today, daysAgo) {
  return new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
}

function emptyWindow(today, days) {
  const out = [];
  for (let i = days; i >= 1; i--) out.push({ date: isoDay(today, i), rhr: null, sleep_eff: null, steps: null, hrv: null });
  return out;
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

// Build one member's data from its source. Returns { id, name, real, history, today, feed_state? }.
export async function loadMemberData(member, { today, days, seed, readFeed }) {
  if (member.source === 'synthetic') {
    const series = generateMemberSeries({ means: member.means }, { today, days, seed });
    return { id: member.id, name: member.name, real: false, history: series.slice(0, -1), today: series[series.length - 1] };
  }
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
}
