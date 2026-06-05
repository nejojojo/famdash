// src/ingest.js — merge the Shortcut's single-row push (feeds/<id>-latest.json)
// into the accumulated history (feeds/<id>.json). Keeps all JSON handling in Node so
// the iOS Shortcut only has to write today's one row (no base64/array surgery on-device).
import { readFile, writeFile } from 'node:fs/promises';
import { mergeFeedRow } from './sources.js';

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return fallback; }
}

// Pure: pick the row out of the latest push (a single object OR a 1-element array)
// and merge it into the history window.
export function buildMerged(latest, history, { today }) {
  const row = Array.isArray(latest) ? latest[latest.length - 1] : latest;
  return mergeFeedRow(Array.isArray(history) ? history : [], row, { today });
}

// Read feeds/<id>-latest.json + feeds/<id>.json, merge, write feeds/<id>.json.
export async function ingest(id, { today = new Date() } = {}) {
  const latest = await readJson(`feeds/${id}-latest.json`, null);
  const history = await readJson(`feeds/${id}.json`, []);
  const merged = buildMerged(latest, history, { today });
  await writeFile(`feeds/${id}.json`, JSON.stringify(merged) + '\n');
  return merged;
}

// CLI: node src/ingest.js [id]   (defaults to "me")
if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2] || 'me';
  const merged = await ingest(id);
  console.log(`ingested feeds/${id}-latest.json → feeds/${id}.json (${merged.length} days)`);
}
