import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  lonLatToTile, tilePointToLonLat, sourceTile, tileIntersectsBounds,
  createPromiseCache, validatePackEntry, groupPolygonRings, clipRingToTile, signedRingArea,
  createRomaniaStore,
} from '../dist/romania-map.js';
import { decodeMVT } from 'cesium';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import xz from 'xz-decompress';

async function decompressLocalPack(buffer, compression) {
  if (compression === 'brotli') return brotliDecompressSync(buffer);
  assert.equal(compression, 'xz');
  return new Uint8Array(await new Response(new xz.XzReadableStream(new Blob([buffer]).stream())).arrayBuffer());
}

test('conversiile Mercator păstrează coordonatele și overzoom folosește tile-ul părinte', () => {
  for (const [lon, lat] of [[26.1025, 44.4268], [23.59, 46.77], [28.6, 44.17]]) {
    const tile = lonLatToTile(lon, lat, 14);
    const point = tilePointToLonLat(Math.floor(tile.x), Math.floor(tile.y), 14, { x: (tile.x % 1) * 4096, y: (tile.y % 1) * 4096 });
    assert.ok(Math.abs(point.longitude - lon) < 1e-9);
    assert.ok(Math.abs(point.latitude - lat) < 1e-9);
    assert.ok(tileIntersectsBounds(Math.floor(tile.x), Math.floor(tile.y), 14));
  }
  assert.deepEqual(sourceTile(1003, 2005, 17, 14), { x: 125, y: 250, z: 14, scale: 8, offsetX: 3, offsetY: 5 });
  assert.deepEqual(sourceTile(35, 22, 6, 14), { x: 35, y: 22, z: 6, scale: 1, offsetX: 0, offsetY: 0 });
  assert.equal(tileIntersectsBounds(0, 0, 10), false);
});

test('cache-ul deduplică cererile, respectă bugetul și reîncearcă după erori', async () => {
  const cache = createPromiseCache({ maxEntries: 2, maxBytes: 6, sizeOf: (value) => value.length });
  let count = 0; let resolve;
  const a = cache.get('a', () => { count += 1; return new Promise((done) => { resolve = done; }); });
  const b = cache.get('a', () => { throw new Error('Nu trebuie cerut de două ori'); });
  await Promise.resolve(); resolve('abc');
  assert.equal(await a, 'abc'); assert.equal(await b, 'abc'); assert.equal(count, 1);
  await cache.get('b', () => 'def');
  await cache.get('a', () => 'incorrect'); // a becomes most recently used
  await cache.get('c', () => '123');
  assert.equal(cache.size, 2); assert.equal(cache.bytes, 6);
  assert.equal(await cache.get('b', () => 'new'), 'new');
  await assert.rejects(cache.get('failure', () => Promise.reject(new Error('temporar'))));
  assert.equal(await cache.get('failure', () => 'ok'), 'ok');
});

test('golirea cache-ului nu permite cererilor vechi să îl repopuleze', async () => {
  const cache = createPromiseCache(); let resolve;
  const pending = cache.get('a', () => new Promise((done) => { resolve = done; }));
  await Promise.resolve(); cache.clear(); resolve('old'); await pending;
  assert.equal(cache.size, 0); assert.equal(cache.pending, 0);
});

test('indexul nu poate referi fișiere arbitrare sau regiuni din afara pachetului', () => {
  assert.deepEqual(validatePackEntry(['000001.bin', 100, 200]), ['000001.bin', 100, 200]);
  for (const value of [['../secret.bin', 0, 1], ['000001.bin', -1, 2], ['000001.bin', 0, 0], ['000001.bin', 0, 9 * 1024 * 1024], ['000001.bin', 0.5, 1]]) {
    assert.throws(() => validatePackEntry(value));
  }
  assert.deepEqual(validatePackEntry(['000001.bin', 10 * 1024 * 1024, 0], { maximumBytes: 32 * 1024 * 1024, allowEmpty: true }), ['000001.bin', 10 * 1024 * 1024, 0]);
  assert.throws(() => validatePackEntry(['000001.bin', 33 * 1024 * 1024, 0], { maximumBytes: 32 * 1024 * 1024, allowEmpty: true }));
});

for (const compression of ['brotli', 'xz']) test(`formatul v2 decodează pachetul ${compression} o singură dată și păstrează tile-urile goale`, async () => {
  const payload = Uint8Array.from([1, 7, 13, 21, 42]);
  const compressed = compression === 'brotli' ? brotliCompressSync(payload) : Buffer.from('fd377a585a000004e6d6b4460200210116000000742fe5a301000401070d152a0000000098a35099386b212200011d05b82d80af1fb6f37d010000000004595a', 'hex');
  let packRequests = 0, decompressions = 0;
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith('manifest.json')) return Response.json({ version: 2, format: 'pbf', compression: 'none', packCompression: compression,
      maxExpandedPackBytes: 32 * 1024 * 1024, minzoom: 0, maxzoom: 14, bounds: [20.24181, 43.61247, 30.27896, 48.26948] });
    if (url.pathname.endsWith('index/6/36.json')) return Response.json({ 22: ['000000.bin', 0, 3], 23: ['000000.bin', 3, 0] });
    if (url.pathname.endsWith('index/6/37.json')) return Response.json({ 22: ['000000.bin', 3, 2] });
    if (url.pathname.endsWith('packs/000000.bin')) { packRequests++; return new Response(compressed); }
    return new Response('', { status: 404 });
  };
  const store = await createRomaniaStore({ decodeMVT: (buffer) => ({ layers: [], bytes: [...new Uint8Array(buffer)] }) }, {
    fetchImpl, documentUrl: 'http://localhost:4173/', decompressPack: async (buffer, codec) => {
      decompressions++; assert.equal(codec, compression); return decompressLocalPack(buffer, codec);
    },
  });
  const [first, empty, last] = await Promise.all([store.tile(36, 22, 6), store.tile(36, 23, 6), store.tile(37, 22, 6)]);
  assert.deepEqual(first.bytes, [1, 7, 13]);
  assert.deepEqual(empty.bytes, []);
  assert.deepEqual(last.bytes, [21, 42]);
  assert.equal(packRequests, 1); assert.equal(decompressions, 1);
  assert.equal(store.cacheStats.packBytes, payload.byteLength, 'Cache-ul contabilizează dimensiunea expandată.');
  store.destroy();
});

test('golurile și multipoligoanele sunt păstrate, bufferul este decupat la marginea tile-ului', () => {
  const square = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 }];
  const outer = square(-10, -10, 80, 80); const hole = square(20, 20, 40, 40).reverse();
  const groups = groupPolygonRings([outer, hole, square(90, 90, 110, 110)]);
  assert.equal(groups.length, 2); assert.equal(groups[0].holes.length, 1);
  const clipped = clipRingToTile(outer, 100);
  assert.ok(clipped.every((p) => p.x >= 0 && p.y >= 0 && p.x <= 100 && p.y <= 100));
  assert.equal(Math.abs(signedRingArea(clipped)), 6400);
  assert.deepEqual(clipRingToTile(square(-20, -20, -10, -10), 100), []);
});

test('pachetul România publicat se decodează cu Cesium fără cereri externe', async (t) => {
  const root = new URL('../dist/maps/romania/', import.meta.url);
  try { await readFile(new URL('manifest.json', root)); } catch { t.skip('Pachetul România este încă în curs de pregătire.'); return; }
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push(url.href);
    assert.equal(url.origin, 'http://localhost:4173');
    assert.equal(options.mode, 'same-origin');
    assert.equal(options.redirect, 'error');
    try { return new Response(await readFile(new URL(url.pathname.replace('/maps/romania/', ''), root))); }
    catch { return new Response('', { status: 404 }); }
  };
  const store = await createRomaniaStore({ decodeMVT }, { fetchImpl, documentUrl: 'http://localhost:4173/', decompressPack: decompressLocalPack });
  const xy = lonLatToTile(26.1025, 44.4268, 14);
  const tile = await store.tile(Math.floor(xy.x), Math.floor(xy.y), 14);
  assert.ok(tile.layers.some((layer) => layer.name === 'buildings' && layer.features.length > 0));
  assert.ok(tile.layers.some((layer) => layer.name === 'streets' && layer.features.length > 0));
  const count = requests.length;
  assert.equal(await store.tile(Math.floor(xy.x), Math.floor(xy.y), 14), tile);
  assert.equal(requests.length, count, 'Aceeași geometrie este reutilizată la overzoom.');
  const outside = await store.tile(0, 0, 14);
  assert.equal(outside.layers.length, 0); assert.equal(requests.length, count);
  store.destroy();
});
