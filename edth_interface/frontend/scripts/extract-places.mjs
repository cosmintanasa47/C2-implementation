#!/usr/bin/env node
/** Build an offline place-name index from the prepared Shortbread tile packs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import decodeMVT from '../node_modules/@cesium/engine/Source/Scene/decodeMVT.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(process.argv[2] || path.join(root, 'dist/maps/romania'));
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const kinds = new Set(['capital', 'state_capital', 'city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood']);
const maxzoom = Math.min(10, manifest.maxzoom);
const [west, south, east, north] = manifest.bounds;

function parsePoly(text) {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim());
  const rings = [];
  let cursor = 1;
  while (cursor < lines.length && lines[cursor] !== 'END') {
    const hole = lines[cursor++].startsWith('!');
    const points = [];
    while (cursor < lines.length && lines[cursor] !== 'END') {
      const pair = lines[cursor++].split(/\s+/).map(Number);
      if (pair.length !== 2 || pair.some(value => !Number.isFinite(value))) throw Error('Invalid Romania .poly boundary');
      points.push(pair);
    }
    cursor++;
    if (points.length < 3) throw Error('Romania boundary ring has fewer than 3 points');
    rings.push({ hole, points });
  }
  if (!rings.length) throw Error('Romania boundary contains no rings');
  return rings;
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const boundary = parsePoly(fs.readFileSync(path.join(directory, 'romania.poly'), 'utf8'));
function inside(lon, lat) {
  return lon >= west && lon <= east && lat >= south && lat <= north &&
    boundary.some(ring => !ring.hole && inRing(lon, lat, ring.points)) &&
    !boundary.some(ring => ring.hole && inRing(lon, lat, ring.points));
}

const byName = new Map();
const packs = new Map();
function getPack(name) {
  if (!/^\d{6}\.bin$/.test(name)) throw Error('Invalid pack filename');
  if (!packs.has(name)) {
    packs.set(name, fs.readFileSync(path.join(directory, 'packs', name)));
    // The lower zoom data is small, but keep memory bounded for other datasets.
    if (packs.size > 8) packs.delete(packs.keys().next().value);
  }
  return packs.get(name);
}

let tilesRead = 0;
// Highest zoom first gives the best coordinate precision for deduplication.
for (let z = maxzoom; z >= manifest.minzoom; z--) {
  const indexDirectory = path.join(directory, 'index', String(z));
  if (!fs.existsSync(indexDirectory)) continue;
  const indexes = fs.readdirSync(indexDirectory).filter(name => /^\d+\.json$/.test(name)).sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));
  for (const name of indexes) {
    const x = Number(name.split('.')[0]);
    const column = JSON.parse(fs.readFileSync(path.join(indexDirectory, name), 'utf8'));
    for (const [yValue, [packName, offset, length]] of Object.entries(column)) {
      const y = Number(yValue);
      const pack = getPack(packName);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > pack.length) throw Error(`Invalid tile offset ${z}/${x}/${y}`);
      const raw = gunzipSync(pack.subarray(offset, offset + length));
      const decoded = decodeMVT(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      tilesRead++;
      const layer = decoded.layers.find(value => value.name === 'place_labels');
      if (!layer) continue;
      for (const feature of layer.features) {
        const { name: placeName, kind } = feature.properties;
        if (feature.type !== 'Point' || typeof placeName !== 'string' || !placeName.trim() || !kinds.has(kind)) continue;
        for (const point of feature.geometry) {
          const worldX = (x + point.x / layer.extent) / 2 ** z;
          const worldY = (y + point.y / layer.extent) / 2 ** z;
          const lon = worldX * 360 - 180;
          const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180 / Math.PI;
          if (!inside(lon, lat)) continue;
          const normalized = placeName.normalize('NFC').trim();
          const key = normalized.toLocaleLowerCase('ro') + '|' + kind;
          const matches = byName.get(key) || [];
          // Lower zoom quantization can move coordinates slightly; never merge
          // equally named settlements kilometers apart.
          if (matches.some(value => Math.hypot((value.lon - lon) * Math.cos(lat * Math.PI / 180), value.lat - lat) < 0.005)) continue;
          matches.push({ name: normalized, lon: Number(lon.toFixed(6)), lat: Number(lat.toFixed(6)), kind });
          byName.set(key, matches);
        }
      }
    }
  }
}

const result = [...byName.values()].flat().sort((a, b) => a.name.localeCompare(b.name, 'ro') || a.kind.localeCompare(b.kind) || a.lon - b.lon || a.lat - b.lat);
if (result.length < 100) throw Error(`Only ${result.length} places found; refusing incomplete gazetteer`);
const target = path.join(directory, 'cities.json');
fs.writeFileSync(target, JSON.stringify(result) + '\n');
manifest.gazetteer = 'cities.json';
manifest.placeCount = result.length;
manifest.gazetteerMaxZoom = maxzoom;
manifest.gazetteerCoverage = 'Geofabrik Romania extract polygon; cartographic place labels, not an administrative registry';
fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest) + '\n');
console.log(JSON.stringify({ tilesRead, places: result.length, bytes: fs.statSync(target).size, samples: result.filter(value => ['București', 'Cluj-Napoca', 'Iași', 'Timișoara', 'Constanța'].includes(value.name)) }, null, 2));
