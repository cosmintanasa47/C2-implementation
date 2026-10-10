#!/usr/bin/env node
/** Aggregate OSM venues from the prepared Shortbread tile packs into weighted activity cells. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import decodeMVT from '../node_modules/@cesium/engine/Source/Scene/decodeMVT.js';
import { ACTIVITY_GROUPS, CELL_LEVEL } from '../dist/civil-activity-model.js';

const VALUE_SCALE = 10;
const LAYERS = new Set(['pois', 'public_transport']);

// [group, weight]: a rough relative size of the venue at its own busiest hour. Assumptions, not counts.
const AMENITY = {
  restaurant: ['food', 3], fast_food: ['food', 3], cafe: ['food', 2], food_court: ['food', 8], ice_cream: ['food', 1],
  bar: ['night', 3], pub: ['night', 3], biergarten: ['night', 3], nightclub: ['night', 6], casino: ['night', 4],
  marketplace: ['shop', 10], fuel: ['shop', 1], car_wash: ['shop', 0.5], car_rental: ['shop', 0.5],
  university: ['edu', 25], college: ['edu', 10], school: ['edu', 12], kindergarten: ['edu', 4], library: ['edu', 3],
  bank: ['work', 2], post_office: ['work', 2], townhall: ['work', 5], courthouse: ['work', 5], police: ['work', 2],
  public_building: ['work', 3], community_centre: ['work', 3], fire_station: ['work', 1],
  hospital: ['health', 25], clinic: ['health', 4], doctors: ['health', 2], dentist: ['health', 1], pharmacy: ['health', 1.5], veterinary: ['health', 1],
  cinema: ['leisure', 8], theatre: ['leisure', 6], arts_centre: ['leisure', 3], fountain: ['leisure', 0.3],
  place_of_worship: ['worship', 3],
};
const SHOP = { mall: 60, department_store: 15, supermarket: 8, doityourself: 6, furniture: 3, garden_centre: 3, convenience: 1.5, bakery: 1.5, kiosk: 0.5 };
const TOURISM = {
  hotel: ['lodging', 5], hostel: ['lodging', 3], motel: ['lodging', 2], guest_house: ['lodging', 1.5], chalet: ['lodging', 1], camp_site: ['lodging', 2],
  museum: ['leisure', 5], attraction: ['leisure', 4], zoo: ['leisure', 10], theme_park: ['leisure', 10], viewpoint: ['leisure', 1], artwork: ['leisure', 0.3],
};
const LEISURE = { sports_centre: 4, stadium: 6, water_park: 8, ice_rink: 4, playground: 2, dog_park: 1, pitch: 0.7, golf_course: 2 };
const HISTORIC = { castle: 3, fort: 2, monument: 1, memorial: 0.5, archaeological_site: 1, ruins: 0.5 };
const TRANSPORT = { station: 20, bus_station: 12, aerodrome: 10, halt: 3, ferry_terminal: 3, tram_stop: 2, bus_stop: 1 };

/** Street furniture and private features (benches, bins, pools, ATMs…) are deliberately unclassified. */
export function classifyPoi(layerName, properties) {
  if (layerName === 'public_transport') return Object.hasOwn(TRANSPORT, properties.kind) ? ['transit', TRANSPORT[properties.kind]] : null;
  if (layerName !== 'pois') return null;
  const { shop, amenity, tourism, leisure, historic } = properties;
  if (typeof shop === 'string' && shop && shop !== 'vacant' && shop !== 'no') return ['shop', Object.hasOwn(SHOP, shop) ? SHOP[shop] : 1];
  if (Object.hasOwn(AMENITY, amenity)) return AMENITY[amenity];
  if (Object.hasOwn(TOURISM, tourism)) return TOURISM[tourism];
  if (Object.hasOwn(LEISURE, leisure)) return ['leisure', LEISURE[leisure]];
  if (Object.hasOwn(HISTORIC, historic)) return ['leisure', HISTORIC[historic]];
  return null;
}

function varint(bytes, state) {
  let value = 0, shift = 0;
  for (;;) {
    if (state.offset >= bytes.length || shift > 28) throw Error('Invalid vector tile varint');
    const byte = bytes[state.offset++];
    value |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return value >>> 0;
    shift += 7;
  }
}

/** Keep only the named layers of a vector tile, so the heavy building and street layers are never decoded. */
export function selectLayers(bytes, names) {
  const kept = [], state = { offset: 0 };
  while (state.offset < bytes.length) {
    const start = state.offset, tag = varint(bytes, state);
    if (tag !== 0x1a) throw Error('Unexpected vector tile field');
    const length = varint(bytes, state), end = state.offset + length;
    if (end > bytes.length) throw Error('Truncated vector tile layer');
    // The layer name is field 1, wherever the writer placed it among the other fields.
    const inner = { offset: state.offset };
    while (inner.offset < end) {
      const field = varint(bytes, inner), wire = field & 7;
      if (wire === 0) varint(bytes, inner);
      else if (wire === 2) {
        const size = varint(bytes, inner);
        if (field === 0x0a) {
          if (names.has(Buffer.from(bytes.subarray(inner.offset, inner.offset + size)).toString('utf8'))) kept.push(bytes.subarray(start, end));
          break;
        }
        inner.offset += size;
      } else if (wire === 5) inner.offset += 4;
      else if (wire === 1) inner.offset += 8;
      else throw Error('Unsupported vector tile wire type');
    }
    state.offset = end;
  }
  return Buffer.concat(kept);
}

/** Sparse records: u16 dx, u16 dy, u16 group mask, then one u16 (weight × VALUE_SCALE) per set bit. */
export function encodeCells(cells, originX, originY) {
  const groups = ACTIVITY_GROUPS.length, chunks = [];
  let count = 0;
  for (const [key, weights] of [...cells].sort((a, b) => a[0] - b[0])) {
    const x = key % 2 ** CELL_LEVEL - originX, y = Math.floor(key / 2 ** CELL_LEVEL) - originY;
    if (x < 0 || y < 0 || x > 0xffff || y > 0xffff) throw Error('Activity cell outside the encodable extent');
    const values = [];
    let mask = 0;
    for (let bit = 0; bit < groups; bit++) {
      const value = Math.min(0xffff, Math.round(weights[bit] * VALUE_SCALE));
      if (value > 0) { mask |= 1 << bit; values.push(value); }
    }
    if (!mask) continue;
    const record = Buffer.alloc(6 + values.length * 2);
    record.writeUInt16LE(x, 0); record.writeUInt16LE(y, 2); record.writeUInt16LE(mask, 4);
    values.forEach((value, index) => record.writeUInt16LE(value, 6 + index * 2));
    chunks.push(record); count++;
  }
  return { bytes: Buffer.concat(chunks), count };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = path.resolve(process.argv[2] || path.join(root, 'dist/maps/romania'));
  const output = path.join(root, 'dist/civil-data');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.compression !== 'gzip') throw Error('Activity preparation needs the initial gzip tile packs');
  const z = manifest.maxzoom, factor = 2 ** (CELL_LEVEL - z), side = 2 ** CELL_LEVEL;
  if (z > CELL_LEVEL) throw Error('Tile zoom exceeds the activity cell level');
  const groupIndex = new Map(ACTIVITY_GROUPS.map((group, index) => [group.id, index]));
  const cells = new Map(), venues = new Array(ACTIVITY_GROUPS.length).fill(0), packs = new Map();
  let tilesRead = 0, features = 0, classified = 0;
  const indexDirectory = path.join(directory, 'index', String(z));
  for (const name of fs.readdirSync(indexDirectory).filter(value => /^\d+\.json$/.test(value))) {
    const x = Number(name.split('.')[0]);
    const column = JSON.parse(fs.readFileSync(path.join(indexDirectory, name), 'utf8'));
    for (const [yValue, [packName, offset, length]] of Object.entries(column)) {
      const y = Number(yValue);
      if (!/^\d{6}\.bin$/.test(packName)) throw Error('Invalid pack filename');
      if (!packs.has(packName)) {
        packs.set(packName, fs.readFileSync(path.join(directory, 'packs', packName)));
        if (packs.size > 8) packs.delete(packs.keys().next().value);
      }
      const pack = packs.get(packName);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > pack.length) throw Error(`Invalid tile offset ${z}/${x}/${y}`);
      const selected = selectLayers(gunzipSync(pack.subarray(offset, offset + length)), LAYERS);
      tilesRead++;
      if (!selected.length) continue;
      const decoded = decodeMVT(selected.buffer.slice(selected.byteOffset, selected.byteOffset + selected.byteLength));
      for (const layer of decoded.layers) {
        for (const feature of layer.features) {
          if (feature.type !== 'Point') continue;
          features++;
          const match = classifyPoi(layer.name, feature.properties);
          if (!match) continue;
          const point = feature.geometry[0];
          // Buffered copies outside the tile belong to the neighbouring tile.
          if (!(point?.x >= 0 && point.x < layer.extent && point.y >= 0 && point.y < layer.extent)) continue;
          const key = Math.floor((y + point.y / layer.extent) * factor) * side + Math.floor((x + point.x / layer.extent) * factor);
          let weights = cells.get(key);
          if (!weights) cells.set(key, weights = new Float64Array(ACTIVITY_GROUPS.length));
          weights[groupIndex.get(match[0])] += match[1];
          venues[groupIndex.get(match[0])]++; classified++;
        }
      }
    }
  }
  if (classified < 10_000) throw Error(`Only ${classified} venues found; refusing an incomplete activity package`);
  let originX = Infinity, originY = Infinity, maxX = 0, maxY = 0;
  for (const key of cells.keys()) {
    const x = key % side, y = Math.floor(key / side);
    originX = Math.min(originX, x); originY = Math.min(originY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const { bytes, count } = encodeCells(cells, originX, originY);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'activity-cells.bin'), bytes);
  const result = {
    schemaVersion: 1, level: CELL_LEVEL, originX, originY, width: maxX - originX + 1, height: maxY - originY + 1,
    cellCount: count, valueScale: VALUE_SCALE, groups: ACTIVITY_GROUPS.map(group => group.id),
    encoding: 'little-endian: u16 dx, u16 dy, u16 group mask, u16 weight × valueScale per set bit',
    file: 'activity-cells.bin', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    venues: Object.fromEntries(ACTIVITY_GROUPS.map((group, index) => [group.id, venues[index]])), venueCount: classified, pointFeatures: features,
    source: { attribution: manifest.attribution, url: manifest.source, date: manifest.date, layers: [...LAYERS], tilesRead },
    limitation: 'Venue weights and hourly profiles are modelling assumptions. Cells rank mapped venues; they do not count people.',
  };
  fs.writeFileSync(path.join(output, 'activity.json'), JSON.stringify(result) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
