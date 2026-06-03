// src/store.js
import { readFile, writeFile } from 'node:fs/promises';

export async function writeStore(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

export async function readStore(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
