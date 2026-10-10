import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACTIVITY_BANDS, ACTIVITY_GROUPS, CELL_LEVEL, activityBand, activityPixels, bucharestClock, cellActivity, cellAreaKm2, cellKey,
  decodeCells, densityAtLevel, groupFactors, tileCells, trafficCongestion,
} from '../dist/civil-activity-model.js';
import { createCivilActivity } from '../dist/civil-activity.js';
import { classifyPoi, encodeCells, selectLayers } from '../scripts/prepare-civil-activity.mjs';

const GROUPS = ACTIVITY_GROUPS.length, index = id => ACTIVITY_GROUPS.findIndex(group => group.id === id);
const weights = values => { const result = new Float64Array(GROUPS); for (const [id, value] of Object.entries(values)) result[index(id)] = value; return result; };
function pack(entries, originX = 30000, originY = 23000) {
  const { bytes, count } = encodeCells(new Map(entries.map(([x, y, values]) => [cellKey(CELL_LEVEL, x, y), weights(values)])), originX, originY);
  const manifest = { schemaVersion: 1, level: CELL_LEVEL, originX, originY, cellCount: count, valueScale: 10, groups: ACTIVITY_GROUPS.map(group => group.id), file: 'activity-cells.bin', bytes: bytes.length };
  return { manifest, buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}
const line = (points, properties) => ({ type: 'LineString', geometry: [points.map(([x, y]) => ({ x, y }))], properties });
const flow = features => ({ layers: [{ name: 'Traffic flow', extent: 4096, features }] });

test('the local clock follows Romanian time, including daylight saving', () => {
  assert.deepEqual(bucharestClock(new Date('2026-10-10T10:11:00Z')), { day: 6, hour: 13 + 11 / 60 });
  assert.deepEqual(bucharestClock(new Date('2026-01-12T22:30:00Z')), { day: 2, hour: 0.5 });
});

test('hourly profiles are complete shares of a weekly peak and interpolate across midnight', () => {
  for (const group of ACTIVITY_GROUPS) for (const profile of Object.values(group.profiles)) {
    assert.equal(profile.length, 24);
    assert.ok(profile.every(value => value >= 0 && value <= 1), group.id);
  }
  const factor = (id, day, hour) => groupFactors(day, hour)[index(id)];
  assert.equal(factor('edu', 2, 9.5), 1);
  assert.equal(factor('edu', 0, 9.5), 0);
  assert.ok(factor('night', 6, 23.5) > factor('night', 2, 23.5));
  // Saturday 00:00 lies between Friday 23:30 and Saturday 00:30.
  assert.ok(Math.abs(factor('night', 6, 0) - (1 + .95) / 2) < 1e-9);
  // Monday 00:00 lies between Sunday 23:30 and Monday 00:30.
  assert.ok(Math.abs(factor('night', 1, 0) - (.1 + .1) / 2) < 1e-9);
  assert.throws(() => groupFactors(7, 3));
  assert.throws(() => groupFactors(1, 24));
});

test('bands have exact boundaries and invalid values are never green', () => {
  assert.equal(activityBand(0), 'green');
  assert.equal(activityBand(ACTIVITY_BANDS.yellow - 0.01), 'green');
  assert.equal(activityBand(ACTIVITY_BANDS.yellow), 'yellow');
  assert.equal(activityBand(ACTIVITY_BANDS.red), 'red');
  for (const value of [undefined, null, NaN, -1, '500']) assert.equal(activityBand(value), 'unknown');
});

test('venues are classified by type; street furniture and unknown tags are left out', () => {
  assert.deepEqual(classifyPoi('pois', { shop: 'mall' }), ['shop', 60]);
  assert.deepEqual(classifyPoi('pois', { shop: 'florist' }), ['shop', 1]);
  assert.deepEqual(classifyPoi('pois', { amenity: 'nightclub' }), ['night', 6]);
  assert.deepEqual(classifyPoi('pois', { tourism: 'hotel' }), ['lodging', 5]);
  assert.deepEqual(classifyPoi('public_transport', { kind: 'station' }), ['transit', 20]);
  for (const properties of [{ amenity: 'bench' }, { amenity: 'atm' }, { leisure: 'swimming_pool' }, { shop: 'vacant' }, { amenity: 'constructor' }, {}]) assert.equal(classifyPoi('pois', properties), null);
  assert.equal(classifyPoi('public_transport', { kind: 'helipad' }), null);
  assert.equal(classifyPoi('buildings', { shop: 'mall' }), null);
  for (const match of [classifyPoi('pois', { amenity: 'cafe' }), classifyPoi('pois', { historic: 'castle' })]) assert.ok(index(match[0]) >= 0);
});

test('only the requested vector tile layers are kept, wherever the name field is', () => {
  const layer = (name, nameFirst) => {
    const text = Buffer.from(name), nameField = Buffer.concat([Buffer.from([0x0a, text.length]), text]), version = Buffer.from([0x78, 0x02]);
    const body = nameFirst ? Buffer.concat([nameField, version]) : Buffer.concat([version, nameField]);
    return Buffer.concat([Buffer.from([0x1a, body.length]), body]);
  };
  const pois = layer('pois', false), transport = layer('public_transport', true);
  const selected = selectLayers(Buffer.concat([layer('buildings', true), pois, layer('streets', false), transport]), new Set(['pois', 'public_transport']));
  assert.deepEqual(selected, Buffer.concat([pois, transport]));
  assert.equal(selectLayers(Buffer.alloc(0), new Set(['pois'])).length, 0);
  assert.throws(() => selectLayers(Buffer.from([0x1a, 0x7f, 0x0a]), new Set(['pois'])));
});

test('cells survive encoding, and damaged or foreign files are refused', () => {
  const { manifest, buffer } = pack([[30010, 23020, { shop: 60, food: 4.5 }], [30011, 23020, { edu: 12 }], [30500, 24000, {}]]);
  const cells = decodeCells(buffer, manifest);
  assert.equal(cells.count, 2, 'A cell without classified venues is not stored.');
  assert.deepEqual([...cells.x], [30010, 30011]);
  assert.deepEqual([...cells.y], [23020, 23020]);
  assert.equal(cells.weights[index('shop')], 60);
  assert.equal(cells.weights[index('food')], 4.5);
  assert.equal(cells.weights[GROUPS + index('edu')], 12);
  assert.throws(() => decodeCells(buffer.slice(0, buffer.byteLength - 1), manifest));
  assert.throws(() => decodeCells(buffer, { ...manifest, cellCount: 1 }));
  assert.throws(() => decodeCells(buffer, { ...manifest, groups: [...manifest.groups].reverse() }));
  assert.throws(() => decodeCells(buffer, { ...manifest, schemaVersion: 2 }));
});

test('zooming out keeps the intensity of the busy cell instead of diluting it over empty land', () => {
  const { manifest, buffer } = pack([[30000, 23200, { shop: 100 }], [30003, 23203, { shop: 1 }], [30100, 23300, { edu: 10 }]]);
  const cells = decodeCells(buffer, manifest);
  const activity = cellActivity(cells, groupFactors(6, 12.5)); // Saturday noon: shops at their peak, schools almost closed
  assert.ok(Math.abs(activity[0] - 100) < 1e-4 && Math.abs(activity[1] - 1) < 1e-5);
  const area = cellAreaKm2(CELL_LEVEL, 23200);
  assert.ok(area > 0.15 && area < 0.21, 'A level 16 cell in Romania is roughly 430 m wide.');
  const fine = densityAtLevel(cells, activity, CELL_LEVEL);
  assert.ok(Math.abs(fine.get(cellKey(CELL_LEVEL, 30000, 23200)) - 100 / area) < 1e-3);
  const coarse = densityAtLevel(cells, activity, CELL_LEVEL - 2).get(cellKey(CELL_LEVEL - 2, 7500, 5800));
  const expected = (100 * 100 + 1 * 1) / area / 101;
  assert.ok(Math.abs(coarse - expected) / expected < 0.001);
  assert.ok(coarse > 0.98 * 100 / area, 'The weighted mean stays near the busy cell.');
  // A cell whose venues are all closed is known and quiet, not missing.
  const sunday = densityAtLevel(cells, cellActivity(cells, groupFactors(0, 3.5)), CELL_LEVEL);
  assert.equal(sunday.get(cellKey(CELL_LEVEL, 30100, 23300)), 0);
  assert.equal(sunday.has(cellKey(CELL_LEVEL, 30101, 23300)), false);
});

test('tile grids cover the tile with one shared margin cell and never exceed the cell level', () => {
  assert.deepEqual(tileCells(1171, 742, 12), { level: 16, startX: 18735, startY: 11871, size: 18, cellPixels: 32, offsetX: -32, offsetY: -32 });
  assert.deepEqual(tileCells(37522, 23718, 16), { level: 16, startX: 37521, startY: 23717, size: 3, cellPixels: 512, offsetX: -512, offsetY: -512 });
  assert.equal(tileCells(36, 22, 6).level, 12);
  assert.equal(tileCells(1, 0, 1).level, 7);
  const left = tileCells(10, 5, 10), right = tileCells(11, 5, 10);
  assert.equal(left.startX + left.size - 1, right.startX + 1, 'The margin of one tile is the first cell of the next.');
});

test('pixels use the three bands, stay transparent without venues, and congestion can only raise a band', () => {
  const grid = { level: 16, startX: 0, startY: 0, size: 2 };
  const density = new Map([[cellKey(16, 0, 0), 50], [cellKey(16, 1, 0), 250], [cellKey(16, 0, 1), 900]]);
  const alpha = pixels => [0, 1, 2, 3].map(cell => pixels[cell * 4 + 3]);
  const base = activityPixels(grid, density);
  assert.deepEqual([...base.slice(0, 3)], [60, 166, 107]);
  assert.deepEqual([...base.slice(4, 7)], [225, 187, 64]);
  assert.deepEqual([...base.slice(8, 11)], [217, 86, 80]);
  assert.equal(alpha(base)[3], 0);
  const congested = activityPixels(grid, density, () => 1);
  assert.deepEqual([...congested.slice(0, 3)], [225, 187, 64], '50 × 2 reaches yellow.');
  assert.deepEqual([...congested.slice(4, 7)], [217, 86, 80], '250 × 2 reaches red.');
  assert.equal(alpha(congested)[3], 0, 'Congestion alone never invents activity.');
  assert.deepEqual([...activityPixels(grid, density, () => 0)], [...base]);
});

test('congestion is the length-weighted slowdown of measured roads per sub-cell', () => {
  const cells = trafficCongestion(flow([
    line([[0, 100], [1000, 100]], { relative_speed: 0.5 }), line([[0, 200], [1000, 200]], { relative_speed: 1 }),
    line([[3000, 3000], [4000, 3000]], { relative_speed: 0.2 }),
    line([[1100, 100], [2000, 100]], { relative_speed: '0.1' }), line([[1100, 300], [2000, 300]], { road_closure: true, relative_speed: 0 }),
    line([[2100, 2100], [2110, 2100]], { relative_speed: 0 }),
  ]), 9000, 5800, 14);
  assert.deepEqual(cells.map(({ level, x, y }) => [level, x, y]), [[16, 36000, 23200], [16, 36003, 23202]]);
  assert.ok(Math.abs(cells[0].congestion - 0.25) < 1e-9);
  assert.ok(Math.abs(cells[1].congestion - 0.8) < 1e-9);
  // Tiles finer than one cell report the cell that contains them.
  assert.deepEqual(trafficCongestion(flow([line([[0, 0], [4000, 0]], { relative_speed: 0.4 })]), 144001, 92803, 18).map(({ level, x, y }) => [level, x, y]), [[16, 36000, 23200]]);
  assert.deepEqual(trafficCongestion(null, 0, 0, 14), []);
  assert.deepEqual(trafficCongestion({ layers: [{ name: 'Other', extent: 4096, features: [line([[0, 0], [4000, 0]], { relative_speed: 0 })] }] }, 0, 0, 14), []);
});

function setup({ now = new Date('2026-10-10T10:11:00Z'), fail = false } = {}) {
  // Level 16 cell (37522, 23718) and its neighbour; Saturday 13:11 in Romania.
  const data = pack([[37522, 23718, { shop: 30 }], [37523, 23718, { shop: 2 }]], 37000, 23000);
  let nextTimer = 0, clock = now, renders = 0, raised = 0;
  const scheduled = new Map(), layers = [], statuses = [], requests = [], drawn = [];
  const timers = {
    setTimeout(fn, delay) { const id = ++nextTimer; scheduled.set(id, { fn, delay }); return id; },
    clearTimeout(id) { scheduled.delete(id); },
    run(delay) { for (const [id, item] of [...scheduled]) if (item.delay === delay) { scheduled.delete(id); item.fn(); } },
  };
  const createCanvas = () => ({ getContext: () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData(image) { drawn.push([...image.data]); }, drawImage(...args) { drawn.at(-1).placement = args.slice(1); },
  }) });
  const Cesium = { Rectangle: { fromDegrees: (...args) => args }, WebMercatorTilingScheme: class {}, Event: class {}, Credit: class {} };
  const viewer = {
    isDestroyed: () => false, scene: { requestRender() { renders++; } },
    imageryLayers: {
      addImageryProvider(provider) { const layer = { provider, alpha: 1 }; layers.push(layer); return layer; },
      remove(layer) { layers.splice(layers.indexOf(layer), 1); }, raiseToTop() { raised++; },
    },
  };
  const fetch = async url => {
    requests.push(url);
    if (fail) return { ok: false };
    return url.endsWith('.json') ? { ok: true, json: async () => data.manifest } : { ok: true, arrayBuffer: async () => data.buffer };
  };
  let layerEvents = 0;
  const controller = createCivilActivity(Cesium, viewer, { fetch, createCanvas, timers, now: () => clock, onStatus: status => statuses.push(status), onLayer: () => { layerEvents++; } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const band = async () => { await layers.at(-1).provider.requestImage(37522, 23718, 16); const pixels = drawn.at(-1); return pixels.slice(16, 19).join(); };
  return { controller, layers, statuses, requests, scheduled, timers, drawn, settle, band, setNow(value) { clock = value; }, get layerEvents() { return layerEvents; }, get raised() { return raised; } };
}
const GREEN = '60,166,107', YELLOW = '225,187,64';

test('nothing is loaded before the layer is switched on; the clock then drives the shading', async t => {
  const env = setup(); t.after(() => env.controller.destroy());
  assert.equal(env.requests.length, 0);
  assert.equal(env.statuses.at(-1).state, 'paused');
  env.controller.setVisible(true);
  assert.equal(env.statuses.at(-1).state, 'loading');
  await env.settle();
  assert.deepEqual(env.requests, ['./civil-data/activity.json', './civil-data/activity-cells.bin']);
  assert.equal(env.layers.length, 1);
  assert.equal(env.layerEvents, 1);
  const status = env.statuses.at(-1);
  assert.deepEqual([status.state, status.live, status.day, status.traffic], ['ready', true, 6, false]);
  assert.ok(Math.abs(status.hour - (13 + 11 / 60)) < 1e-9);
  // 30 shop points at Saturday 13:11 on about 0.19 km² is yellow.
  assert.equal(await env.band(), YELLOW);
  assert.deepEqual(env.drawn.at(-1).placement, [-512, -512, 1536, 1536]);
  env.controller.setVisible(false);
  assert.equal(env.layers.length, 0);
  assert.equal(env.scheduled.size, 0);
  env.controller.setVisible(true);
  assert.equal(env.requests.length, 2, 'Cells are downloaded once.');
  assert.equal(env.layers.length, 1);
});

test('a preview hour replaces the shading only after the new layer had time to draw', async t => {
  const env = setup(); t.after(() => env.controller.destroy());
  env.controller.setVisible(true); await env.settle();
  const first = env.layers[0];
  env.controller.setTime({ day: 2, hour: 3 });
  assert.equal(env.layers.length, 2);
  assert.equal(env.layers[1].alpha, 0.01);
  assert.equal(env.statuses.at(-1).live, false);
  assert.equal([...env.scheduled.values()].some(item => item.delay === 5 * 60_000), false, 'A preview does not follow the clock.');
  env.controller.setTime({ day: 2, hour: 4 });
  assert.equal(env.layers.length, 2, 'A superseded pending layer is dropped.');
  assert.equal(env.layers[0], first);
  env.timers.run(400);
  assert.equal(env.layers.length, 1);
  assert.notEqual(env.layers[0], first);
  assert.equal(env.layers[0].alpha, 1);
  assert.equal(await env.band(), GREEN, 'Shops are closed at night: quiet, not missing.');
  for (const invalid of [{ day: 7, hour: 3 }, { day: 1, hour: 24 }, {}, undefined]) env.controller.setTime(invalid);
  assert.equal(env.layers.length, 1);
  env.controller.setTime(null);
  assert.equal(env.statuses.at(-1).live, true);
});

test('the live clock is re-read every five minutes', async t => {
  const env = setup({ now: new Date('2026-10-10T02:00:00Z') }); t.after(() => env.controller.destroy());
  env.controller.setVisible(true); await env.settle();
  assert.equal(await env.band(), GREEN);
  env.setNow(new Date('2026-10-10T10:11:00Z'));
  env.timers.run(5 * 60_000); env.timers.run(400);
  assert.equal(env.layers.length, 1);
  assert.equal(await env.band(), YELLOW);
});

test('fresh road congestion raises the live estimate, never a preview, and expires', async t => {
  const env = setup({ now: new Date('2026-10-10T02:00:00Z') }); t.after(() => env.controller.destroy());
  const jam = flow([line([[0, 100], [4000, 100]], { relative_speed: 0 })]);
  const settling = () => [...env.scheduled.values()].filter(item => item.delay === 2500).length;
  env.controller.setVisible(true); await env.settle();
  env.controller.setTime({ day: 6, hour: 13 }); env.timers.run(400);
  assert.equal(await env.band(), YELLOW);
  env.controller.ingestTraffic({ x: 37522, y: 23718, zoom: 16, tile: jam });
  assert.equal(settling(), 0, 'A preview is not redrawn by traffic.');
  assert.equal(await env.band(), YELLOW);
  assert.equal(env.statuses.at(-1).traffic, false);
  // Saturday 09:00 in Romania: 30 shop points at about 0.38 of their peak stay green on their own.
  env.setNow(new Date('2026-10-10T06:00:00Z'));
  env.controller.setTime(null); env.timers.run(400);
  assert.equal(await env.band(), GREEN, 'The measurement taken hours earlier is not reused.');
  env.controller.ingestTraffic({ x: 2345, y: 1482, zoom: 9, tile: jam });
  assert.equal(settling(), 0, 'Country-scale road averages are ignored.');
  env.controller.ingestTraffic({ x: 37522, y: 23718, zoom: 16, tile: jam });
  env.controller.ingestTraffic({ x: 37522, y: 23718, zoom: 16, tile: jam });
  assert.equal(settling(), 1, 'A burst of tiles causes one redraw.');
  env.timers.run(2500); env.timers.run(400);
  assert.equal(await env.band(), YELLOW, 'Standstill doubles the estimate.');
  assert.equal(env.statuses.at(-1).traffic, true);
  env.setNow(new Date('2026-10-10T06:04:00Z'));
  env.timers.run(5 * 60_000); env.timers.run(400);
  assert.equal(await env.band(), YELLOW, 'A four-minute-old measurement still applies.');
  env.setNow(new Date('2026-10-10T06:06:00Z'));
  env.timers.run(5 * 60_000); env.timers.run(400);
  assert.equal(await env.band(), GREEN, 'A measurement older than five minutes is dropped.');
  assert.equal(env.statuses.at(-1).traffic, false);
  env.controller.ingestTraffic({ x: 37522, y: 23718, zoom: 16, tile: jam });
  env.controller.clearTraffic(); env.timers.run(400);
  assert.equal(await env.band(), GREEN);
});

test('a missing package is reported once and never drawn as quiet', async t => {
  const env = setup({ fail: true }); t.after(() => env.controller.destroy());
  const errors = t.mock.method(console, 'error', () => {});
  env.controller.setVisible(true); await env.settle();
  assert.equal(env.statuses.at(-1).state, 'error');
  assert.match(env.statuses.at(-1).message, /prepare:activity/);
  assert.equal(env.layers.length, 0);
  assert.equal(errors.mock.callCount(), 1);
});

test('destroy removes layers and timers; later calls do nothing', async () => {
  const env = setup(); env.controller.setVisible(true); await env.settle();
  env.controller.setTime({ day: 1, hour: 10 });
  env.controller.destroy();
  assert.equal(env.layers.length, 0);
  assert.equal(env.scheduled.size, 0);
  const before = env.statuses.length;
  env.controller.setVisible(true); env.controller.setTime(null); env.controller.clearTraffic(); env.controller.raise();
  env.controller.ingestTraffic({ x: 0, y: 0, zoom: 14, tile: null });
  assert.equal(env.statuses.length, before);
  assert.equal(env.layers.length, 0);
});

test('the prepared package matches its manifest and covers the largest cities', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/civil-data/activity.json', import.meta.url), 'utf8'));
  const bytes = await readFile(new URL('../dist/civil-data/activity-cells.bin', import.meta.url));
  assert.equal(bytes.length, manifest.bytes);
  const cells = decodeCells(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), manifest);
  assert.equal(cells.count, manifest.cellCount);
  const peak = densityAtLevel(cells, cellActivity(cells, groupFactors(6, 12.5)), CELL_LEVEL), night = densityAtLevel(cells, cellActivity(cells, groupFactors(2, 3.5)), CELL_LEVEL);
  const at = (map, lon, lat) => map.get(cellKey(CELL_LEVEL, Math.floor((lon + 180) / 360 * 2 ** CELL_LEVEL), Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** CELL_LEVEL)));
  for (const [lon, lat] of [[26.1010, 44.4318], [23.5899, 46.7704], [25.5887, 45.6427]]) {
    assert.equal(activityBand(at(peak, lon, lat)), 'red');
    assert.notEqual(activityBand(at(night, lon, lat)), 'red');
  }
});
