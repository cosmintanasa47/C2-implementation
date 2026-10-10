#!/usr/bin/env node
/** Lossless Brotli v2 → XZ v2 conversion. Python's standard liblzma is used only at build time. */
import { readFile, writeFile, readdir, mkdir, cp, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const source = resolve(option('--source', '.cache/maps/romania-compressed'));
const output = resolve(option('--output', '.cache/maps/romania-compressed-xz'));
const concurrency = Number(option('--concurrency', '4'));
const extreme = args.includes('--extreme');
const mergePacks = Number(option('--merge-packs', '1'));
const positionBits = Number(option('--position-bits', '2'));
const dictionaryBytes = (mergePacks > 1 ? 16 : 8) * 1024 * 1024;
const maximumExpanded = 32 * 1024 * 1024;
const maximumCompressed = 8 * 1024 * 1024;
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8
  || !Number.isInteger(mergePacks) || mergePacks < 1 || mergePacks > 2
  || !Number.isInteger(positionBits) || positionBits < 0 || positionBits > 4) throw new Error('Invalid compression options.');
for (const path of [output, `${output}.preparing`]) {
  try { await access(path); throw new Error(`Output already exists: ${path}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
if (manifest.version !== 2 || manifest.compression !== 'none' || manifest.packCompression !== 'brotli') throw new Error('Source must be version 2 whole-pack Brotli.');
const originalIntegrity = JSON.parse(await readFile(join(source, 'packs-integrity.json'), 'utf8'));
const files = (await readdir(join(source, 'packs'))).sort();
if (files.some((name) => !/^\d{6}\.bin$/.test(name)) || files.length !== manifest.packCount) throw new Error('Invalid source pack list.');
const groups = [];
for (let i = 0; i < files.length; i += mergePacks) groups.push(files.slice(i, i + mergePacks));
const known = new Map(originalIntegrity.map((entry) => [entry.name, entry]));
const mappings = new Map();
const staging = `${output}.preparing`;
await mkdir(join(staging, 'packs'), { recursive: true });
const started = Date.now();
let cursor = 0, completed = 0, compressedBytes = 0, expandedBytes = 0;
const integrity = [];
const python = `import sys,lzma
raw=sys.stdin.buffer.read()
preset=9${extreme ? '|lzma.PRESET_EXTREME' : ''}
body=lzma.compress(raw,format=lzma.FORMAT_XZ,filters=[{'id':lzma.FILTER_LZMA2,'preset':preset,'dict_size':${dictionaryBytes},'pb':${positionBits}}])
if lzma.decompress(body)!=raw: raise RuntimeError('Lossless verification failed')
sys.stdout.buffer.write(body)
`;
function compress(raw) {
  return new Promise((resolvePromise, reject) => {
    const process = spawn('python3', ['-c', python], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [], errors = [];
    let bytes = 0;
    process.on('error', reject);
    process.stdin.on('error', reject);
    process.stderr.on('data', (chunk) => errors.push(chunk));
    process.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maximumCompressed) { process.kill(); reject(new Error('Compressed pack exceeds runtime limit.')); }
      else chunks.push(chunk);
    });
    process.on('close', (code) => code === 0 ? resolvePromise(Buffer.concat(chunks)) : reject(new Error(`XZ encoder failed (${code}): ${Buffer.concat(errors)}`)));
    process.stdin.end(raw);
  });
}
async function convert(group, number) {
  const name = `${String(number).padStart(6, '0')}.bin`;
  const parts = [];
  let offset = 0;
  for (const oldName of group) {
    const part = brotliDecompressSync(await readFile(join(source, 'packs', oldName)), { maxOutputLength: maximumExpanded });
    const hash = createHash('sha256').update(part).digest('hex');
    if (!known.has(oldName) || known.get(oldName).sha256 !== hash || known.get(oldName).expandedBytes !== part.length) throw new Error(`Source integrity failure: ${oldName}`);
    parts.push(part); mappings.set(oldName, { name, offset, length: part.length }); offset += part.length;
  }
  if (offset > maximumExpanded) throw new Error(`Merged pack exceeds expanded runtime limit: ${name}`);
  const raw = Buffer.concat(parts);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const body = await compress(raw);
  await writeFile(join(staging, 'packs', name), body);
  integrity.push({ name, expandedBytes: raw.length, compressedBytes: body.length, sha256 });
  compressedBytes += body.length; expandedBytes += raw.length; completed++;
  if (completed % 5 === 0 || completed === groups.length) console.log(JSON.stringify({ completed, total: groups.length, compressedBytes, expandedBytes, seconds: Math.round((Date.now() - started) / 1000) }));
}
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < groups.length) { const number = cursor++; await convert(groups[number], number); }
}));
let tileCount = 0;
for (const z of await readdir(join(source, 'index'))) {
  if (!/^\d+$/.test(z)) continue;
  await mkdir(join(staging, 'index', z), { recursive: true });
  for (const file of await readdir(join(source, 'index', z))) {
    if (!/^\d+\.json$/.test(file)) continue;
    const index = JSON.parse(await readFile(join(source, 'index', z, file), 'utf8'));
    for (const [y, entry] of Object.entries(index)) {
      const [oldName, offset, length] = entry;
      const mapping = mappings.get(oldName);
      if (!mapping || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > mapping.length) throw new Error(`Invalid source tile entry: ${z}/${file}/${y}`);
      index[y] = [mapping.name, mapping.offset + offset, length]; tileCount++;
    }
    await writeFile(join(staging, 'index', z, file), JSON.stringify(index));
  }
}
if (tileCount !== manifest.tileCount) throw new Error(`Tile count mismatch: ${tileCount}`);
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (['manifest.json', 'index', 'packs', 'packs-integrity.json'].includes(entry.name)) continue;
  await cp(join(source, entry.name), join(staging, entry.name), { recursive: true });
}
integrity.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(staging, 'packs-integrity.json'), JSON.stringify(integrity));
const { brotliQuality: _brotliQuality, ...previous } = manifest;
const result = { ...previous, packCompression: 'xz', xzPreset: extreme ? '9e' : 9, xzDictionaryBytes: dictionaryBytes, xzPositionBits: positionBits,
  packCount: groups.length, sourcePackCount: files.length,
  maxExpandedPackBytes: maximumExpanded, compressedBytes, expandedBytes, integrity: 'packs-integrity.json', lossless: true,
  repackedAt: new Date().toISOString() };
await writeFile(join(staging, 'manifest.json'), JSON.stringify(result));
await rename(staging, output);
console.log(JSON.stringify({ output, packCount: groups.length, compressedBytes, expandedBytes, ratio: compressedBytes / manifest.compressedBytes, preset: result.xzPreset, seconds: Math.round((Date.now() - started) / 1000) }));
