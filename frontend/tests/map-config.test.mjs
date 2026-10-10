import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { defaultMapConfig, normalizeMapConfig } from '../dist/map-config.js';

const baseUrl = 'http://localhost:4173/index.html';
const distRoot = new URL('../dist/', import.meta.url);
const normalize = (input = {}) => normalizeMapConfig(input, baseUrl);

test('sursele locale păstrează XYZ și inversează Y pentru TMS', () => {
  const xyz = normalize({ url: '/tiles/{z}/{x}/{y}.png', scheme: 'xyz', projection: 'EPSG:3857' });
  assert.equal(xyz.url, '/tiles/{z}/{x}/{y}.png');
  const tms = normalize({ url: '/tiles/{z}/{x}/{y}.png', scheme: 'tms' });
  assert.equal(tms.url, '/tiles/{z}/{x}/{reverseY}.png');
  assert.equal(normalize(tms).url, tms.url, 'normalizarea repetată nu inversează din nou șablonul');
  assert.equal(defaultMapConfig.url.includes('{reverseY}'), false, 'configurația implicită rămâne nemodificată');
});

test('o sursă de pe altă origine sau cu un protocol incompatibil este respinsă', () => {
  for (const url of [
    'https://example.com/tiles/{z}/{x}/{y}.png',
    '//example.com/tiles/{z}/{x}/{y}.png',
    'http://localhost:4174/tiles/{z}/{x}/{y}.png',
    'https://localhost:4173/tiles/{z}/{x}/{y}.png',
    'file:///tiles/{z}/{x}/{y}.png',
    'data:image/png,{z}/{x}/{y}',
  ]) assert.throws(() => normalize({ url }), Error, url);
  assert.doesNotThrow(() => normalize({ url: 'http://localhost:4173/tiles/{z}/{x}/{y}.png' }));
});

test('șabloanele incomplete și URL-urile cu credențiale sau parametri sunt respinse', () => {
  for (const url of [
    '', '   ', '/tiles/image.png', '/tiles/{x}/{y}.png',
    '/tiles/{z}/{y}.png', '/tiles/{z}/{x}.png',
    '/tiles/{z}/{x}/{y}.png?token=demo', '/tiles/{z}/{x}/{y}.png#fragment',
    'http://name:password@localhost:4173/tiles/{z}/{x}/{y}.png',
  ]) assert.throws(() => normalize({ url }), Error, url);
  assert.throws(() => normalize({ scheme: 'xyz', url: '/tiles/{z}/{x}/{reverseY}.png' }));
  assert.throws(() => normalize({ scheme: 'other' }));
  assert.throws(() => normalize({ projection: 'EPSG:9999' }));
});

test('nivelurile trebuie să fie întregi, ordonate și acoperite de limite explicite peste zero', () => {
  for (const input of [
    { minimumLevel: -1 }, { maximumLevel: 25 }, { maximumLevel: 1.5 },
    { minimumLevel: '0' }, { maximumLevel: NaN }, { maximumLevel: Infinity },
    { minimumLevel: 3, maximumLevel: 2, bounds: [20, 43, 30, 49] },
    { minimumLevel: 1, maximumLevel: 2, bounds: null },
  ]) assert.throws(() => normalize(input), Error, JSON.stringify(input));
  assert.doesNotThrow(() => normalize({ minimumLevel: 1, maximumLevel: 2, bounds: [20, 43, 30, 49] }));
});

test('limitele geografice resping formele invalide și intervalele inversate sau goale', () => {
  for (const bounds of [
    '20,43,30,49', [], [20, 43, 30], [20, 43, 30, 49, 50],
    [20, 43, '30', 49], [20, 43, NaN, 49], [20, 43, Infinity, 49],
    [-181, -90, 180, 90], [-180, -91, 180, 90],
    [-180, -90, 181, 90], [-180, -90, 180, 91],
    [30, 43, 20, 49], [20, 49, 30, 43], [20, 43, 20, 49], [20, 43, 30, 43],
  ]) assert.throws(() => normalize({ bounds }), Error, JSON.stringify(bounds));
  assert.doesNotThrow(() => normalize({ bounds: [-180, -90, 180, 90] }));
});

test('toate tile-urile implicit configurate există local și sunt fișiere JPEG', async () => {
  const config = normalize();
  assert.equal(config.scheme, 'tms');
  assert.equal(config.projection, 'EPSG:4326');
  assert.equal(config.minimumLevel, 0);
  assert.equal(config.maximumLevel, 2);
  // Schema geografică are două coloane și un rând la nivelul zero.
  const files = [];
  for (let z = config.minimumLevel; z <= config.maximumLevel; z += 1) {
    const width = 2 ** (z + 1);
    const height = 2 ** z;
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const path = config.url.replace('{z}', z).replace('{x}', x).replace('{reverseY}', height - y - 1);
        files.push(path);
      }
    }
  }
  assert.equal(files.length, 42);
  await Promise.all(files.map(async (path) => {
    const data = await readFile(new URL(path, distRoot));
    assert.ok(data.length > 2, `${path}: fișier gol`);
    assert.equal(data[0], 0xff, `${path}: semnătură JPEG absentă`);
    assert.equal(data[1], 0xd8, `${path}: semnătură JPEG absentă`);
  }));
});

test('pachetul local Cesium include scriptul, stilurile și directoarele necesare', async () => {
  for (const name of ['Cesium.js', 'Widgets/widgets.css']) {
    const info = await stat(new URL(`vendor/cesium/${name}`, distRoot));
    assert.ok(info.isFile() && info.size > 0, `${name}: fișier absent sau gol`);
  }
  for (const name of ['Assets', 'Workers', 'ThirdParty', 'Widgets']) {
    const directory = new URL(`vendor/cesium/${name}/`, distRoot);
    assert.ok((await stat(directory)).isDirectory(), `${name}: director absent`);
    assert.ok((await readdir(directory)).length > 0, `${name}: director gol`);
  }
});

test('pagina de intrare încarcă scripturi și foi de stil numai din resurse locale existente', async () => {
  const html = await readFile(new URL('index.html', distRoot), 'utf8');
  const tags = [...html.matchAll(/<(script|link)\b[^>]*>/gi)].map((match) => match[0]);
  const resources = [];
  for (const tag of tags) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    if (/^<script\b/i.test(tag) && attr('src')) resources.push(attr('src'));
    if (/^<link\b/i.test(tag) && attr('rel')?.toLowerCase() === 'stylesheet') resources.push(attr('href'));
  }
  assert.ok(resources.length >= 4, 'Scripturile și stilurile de pornire trebuie să fie prezente.');
  for (const resource of resources) {
    assert.ok(resource, 'Resursa trebuie să aibă o cale.');
    const url = new URL(resource, baseUrl);
    assert.equal(url.origin, new URL(baseUrl).origin, `${resource}: origine externă`);
    const local = new URL(`.${url.pathname}`, distRoot);
    assert.ok((await stat(local)).isFile(), `${resource}: fișier local absent`);
  }
});
