#!/usr/bin/env node
/** Lossless v1 per-tile gzip → v2 whole-pack Brotli conversion, all data local. */
import { readFile, writeFile, readdir, mkdir, cp, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gunzipSync, brotliCompress, brotliDecompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const compress = promisify(brotliCompress);
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const source = resolve(option('--source', 'dist/maps/romania'));
const output = resolve(option('--output', '.cache/maps/romania-compressed'));
const quality = Number(option('--quality', '9'));
const concurrency = Number(option('--concurrency', '4'));
const maximumExpanded = Number(option('--max-expanded-bytes', String(32 * 1024 * 1024)));
if (!Number.isInteger(quality) || quality < 1 || quality > 11 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8
  || !Number.isSafeInteger(maximumExpanded) || maximumExpanded < 1 || maximumExpanded > 32 * 1024 * 1024) throw new Error('Invalid compression parameters.');
for (const path of [output, `${output}.preparing`]) {
  try { await access(path); throw new Error(`Output already exists: ${path}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const staging = `${output}.preparing`;
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
if (manifest.version !== 1 || manifest.compression !== 'gzip' || manifest.format !== 'pbf') throw new Error('Source must be version 1 per-tile gzip MVT.');
const byPack = new Map();
for (const z of (await readdir(join(source, 'index'))).sort((a, b) => Number(a) - Number(b))) {
  if (!/^\d+$/.test(z)) continue;
  for (const file of (await readdir(join(source, 'index', z))).sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))) {
    if (!/^\d+\.json$/.test(file)) continue;
    const x = file.slice(0, -5);
    const index = JSON.parse(await readFile(join(source, 'index', z, file), 'utf8'));
    for (const [y, entry] of Object.entries(index)) {
      const [name, offset, length] = entry;
      if (!/^\d{6}\.bin$/.test(name) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 20) throw new Error('Invalid v1 tile entry.');
      if (!byPack.has(name)) byPack.set(name, []);
      byPack.get(name).push({ z, x, y, offset, length });
    }
  }
}
const tileCount = [...byPack.values()].reduce((count, entries) => count + entries.length, 0);
if (tileCount !== manifest.tileCount) throw new Error(`Tile count mismatch: ${tileCount} != ${manifest.tileCount}`);
await mkdir(join(staging, 'packs'), { recursive: true });
const outputIndexes = new Map();
const integrity = [];
let nextPack = 0, completed = 0, compressedBytes = 0, expandedBytes = 0, emptyTiles = 0;
const jobs = [...byPack].sort(([a], [b]) => a.localeCompare(b));
let cursor = 0;
const started = Date.now();

async function convertPack([oldName, entries]) {
  const original = await readFile(join(source, 'packs', oldName));
  entries.sort((a, b) => a.offset - b.offset);
  let expectedOffset = 0, expectedExpanded = 0;
  for (const entry of entries) {
    if (entry.offset !== expectedOffset || entry.offset + entry.length > original.length
      || original[entry.offset] !== 0x1f || original[entry.offset + 1] !== 0x8b) throw new Error(`Invalid contiguous gzip member in ${oldName}.`);
    entry.rawLength = original.readUInt32LE(entry.offset + entry.length - 4);
    if (entry.rawLength > maximumExpanded) throw new Error(`Single tile exceeds expanded pack limit: ${entry.z}/${entry.x}/${entry.y}`);
    entry.rawOffset = expectedExpanded;
    expectedExpanded += entry.rawLength;
    expectedOffset += entry.length;
  }
  if (expectedOffset !== original.length) throw new Error(`Unindexed bytes in ${oldName}.`);
  // Native gzip decoding checks each member's CRC; concatenation preserves the
  // exact raw protobuf byte stream. ISIZE supplies member boundaries, including empty tiles.
  const raw = gunzipSync(original, { maxOutputLength: 256 * 1024 * 1024 });
  if (raw.length !== expectedExpanded) throw new Error(`Expanded length mismatch in ${oldName}.`);
  const groups = [];
  let group = { start: 0, length: 0, entries: [] };
  for (const entry of entries) {
    if (group.entries.length && group.length + entry.rawLength > maximumExpanded) {
      groups.push(group); group = { start: entry.rawOffset, length: 0, entries: [] };
    }
    group.entries.push(entry); group.length += entry.rawLength;
  }
  if (group.entries.length) groups.push(group);
  for (const part of groups) {
    const name = `${String(nextPack++).padStart(6, '0')}.bin`;
    const payload = raw.subarray(part.start, part.start + part.length);
    const body = await compress(payload, { params: { [constants.BROTLI_PARAM_QUALITY]: quality, [constants.BROTLI_PARAM_LGWIN]: 24 } });
    if (body.length > 8 * 1024 * 1024) throw new Error(`Compressed pack exceeds runtime limit: ${name}`);
    const restored = brotliDecompressSync(body);
    if (!restored.equals(payload)) throw new Error(`Lossless round-trip verification failed: ${name}`);
    const sha256 = createHash('sha256').update(payload).digest('hex');
    await writeFile(join(staging, 'packs', name), body);
    integrity.push({ name, expandedBytes: payload.length, compressedBytes: body.length, sha256 });
    compressedBytes += body.length; expandedBytes += payload.length;
    for (const entry of part.entries) {
      const indexKey = `${entry.z}/${entry.x}`;
      if (!outputIndexes.has(indexKey)) outputIndexes.set(indexKey, {});
      outputIndexes.get(indexKey)[entry.y] = [name, entry.rawOffset - part.start, entry.rawLength];
      if (entry.rawLength === 0) emptyTiles++;
    }
  }
  completed++;
  if (completed % 10 === 0 || completed === jobs.length) console.log(JSON.stringify({ completed, total: jobs.length, compressedBytes, expandedBytes, seconds: Math.round((Date.now() - started) / 1000) }));
}

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < jobs.length) { const job = jobs[cursor++]; await convertPack(job); }
}));
for (const [key, index] of outputIndexes) {
  const [z, x] = key.split('/');
  await mkdir(join(staging, 'index', z), { recursive: true });
  await writeFile(join(staging, 'index', z, `${x}.json`), JSON.stringify(index));
}
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (['manifest.json', 'index', 'packs'].includes(entry.name)) continue;
  await cp(join(source, entry.name), join(staging, entry.name), { recursive: true });
}
integrity.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(staging, 'packs-integrity.json'), JSON.stringify(integrity));
const result = { ...manifest, version: 2, compression: 'none', packCompression: 'brotli', brotliQuality: quality,
  maxExpandedPackBytes: maximumExpanded, packCount: nextPack, compressedBytes, expandedBytes, emptyTiles,
  compressedFromBytes: manifest.compressedBytes, integrity: 'packs-integrity.json', lossless: true,
  repackedAt: new Date().toISOString() };
await writeFile(join(staging, 'manifest.json'), JSON.stringify(result));
await rename(staging, output);
console.log(JSON.stringify({ output, tileCount, packCount: nextPack, compressedBytes, expandedBytes, ratio: compressedBytes / manifest.compressedBytes, quality, seconds: Math.round((Date.now() - started) / 1000) }));
