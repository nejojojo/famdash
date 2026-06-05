// src/check-feed.js
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
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
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (!id) { console.error('usage: npm run check-feed -- <id>'); process.exit(2); }
  let rows;
  try { rows = JSON.parse(await readFile(`feeds/${id}.json`, 'utf8')); }
  catch (e) { console.error(`✗ cannot read feeds/${id}.json: ${e.message}`); process.exit(1); }
  const res = validateFeed(rows, { today: new Date() });
  if (res.ok) { console.log(`✓ feeds/${id}.json looks good`); process.exit(0); }
  console.error(`✗ feeds/${id}.json: ${res.reason}`); process.exit(1);
}
