import test from 'node:test';
import assert from 'node:assert/strict';
import { createRomaniaTerrain, decodeTerrarium, terrainChildMask, terrainPixelPosition } from '../dist/romania-terrain.js';

test('Terrarium handles sea level, negative terrain and fractional metres', () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  assert.equal(decodeTerrarium(127, 246, 128), -9.5);
  assert.equal(decodeTerrarium(137, 219, 68), 2523.265625);
});

test('WebMercator conversion addresses pixel centres and north-to-south rows', () => {
  assert.deepEqual(terrainPixelPosition(0, 0, 0), { x: 127.5, y: 127.5 });
  assert.ok(terrainPixelPosition(26, 48, 11).y < terrainPixelPosition(26, 44, 11).y);
});

test('terminal terrain tiles and unavailable children stop refinement', () => {
  const ranges = [{ minX: 0, maxX: 0, minY: 0, maxY: 0 }, { minX: 1, maxX: 1, minY: 0, maxY: 0 }];
  assert.equal(terrainChildMask(0, 0, 0, 1, ranges), 8);
  assert.equal(terrainChildMask(1, 0, 1, 1, ranges), 0);
});

function fixture({ failTiles = false, imageFormat = 'png' } = {}) {
  const requests = [], raised = [];
  const manifest = {
    complete: true, format: 'terrarium', imageFormat, tileSize: 256, maximumLevel: 0,
    bounds: [20.24181, 43.61247, 30.27896, 48.26948],
    coverageTileRanges: [{ minX: 0, maxX: 0, minY: 0, maxY: 0 }],
    storedTileRanges: [{ minX: 0, maxX: 0, minY: 0, maxY: 0 }],
  };
  const Cesium = {
    Event: class { raiseEvent(value) { raised.push(value); } },
    Credit: class {},
    WebMercatorTilingScheme: class { ellipsoid = {}; getNumberOfXTilesAtLevel() { return 1; } },
    TerrainProvider: { getEstimatedLevelZeroGeometricErrorForAHeightmap: () => 1000 },
    HeightmapTerrainData: class { constructor(options) { Object.assign(this, options); } },
  };
  return {
    requests, raised, Cesium,
    options: {
      fetchImpl: async url => {
        requests.push(url);
        return url.endsWith('manifest.json') ? { ok: true, json: async () => manifest }
          : { ok: !failTiles, status: failTiles ? 404 : 200, blob: async () => ({}) };
      },
      decodeImage: async () => new Float32Array(256 * 256).fill(850),
    },
  };
}

test('provider shares tile loads, samples building heights and returns flat outside coverage', async () => {
  const fixtureData = fixture();
  const provider = await createRomaniaTerrain(fixtureData.Cesium, fixtureData.options);
  assert.deepEqual(await provider.sampleHeights([{ longitude: 25, latitude: 45 }, { longitude: 25.1, latitude: 45.1 }, { longitude: 0, latitude: 0 }]), [850, 850, 0]);
  const tile = await provider.requestTileGeometry(0, 0, 0);
  assert.equal(tile.width, 257);
  assert.equal(tile.buffer[0], 850);
  assert.equal(tile.childTileMask, 8, 'Romania child remains available for virtual meshes and detailed imagery.');
  assert.equal(fixtureData.requests.filter(url => url.endsWith('.png')).length, 1);
  const outside = await provider.requestTileGeometry(0, 0, 1);
  assert.equal(outside.childTileMask, 0);
  assert.equal(outside.buffer[0], 0);
  assert.equal(fixtureData.requests.filter(url => url.endsWith('.png')).length, 1);
});

test('missing local terrain raises one error and does not repeatedly fetch', async () => {
  const fixtureData = fixture({ failTiles: true });
  const provider = await createRomaniaTerrain(fixtureData.Cesium, fixtureData.options);
  assert.equal(await provider.sampleHeight(25, 45), 0);
  assert.equal(await provider.sampleHeight(25, 45), 0);
  assert.equal(fixtureData.raised.length, 1);
  assert.equal(fixtureData.requests.filter(url => url.endsWith('.png')).length, 1);
});

test('lossless WebP manifest selects local WebP terrain and preserves sampling', async () => {
  const fixtureData = fixture({ imageFormat: 'webp' });
  const provider = await createRomaniaTerrain(fixtureData.Cesium, fixtureData.options);
  assert.equal(await provider.sampleHeight(25, 45), 850);
  assert.deepEqual(fixtureData.requests, ['./maps/terrain/manifest.json', './maps/terrain/0/0/0.webp']);
});

test('adjacent terrain meshes share identical interpolated border elevations', async () => {
  const fixtureData = fixture();
  const ranges = [
    { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  ];
  fixtureData.options.fetchImpl = async url => url.endsWith('manifest.json') ? {
    ok: true, json: async () => ({
      complete: true, format: 'terrarium', tileSize: 256, maximumLevel: 1,
      bounds: [-180, -85, 180, 85], coverageTileRanges: ranges, storedTileRanges: ranges,
    }),
  } : { ok: true, blob: async () => Number(url.match(/\/([01])\/[01]\.png$/)[1]) * 100 };
  fixtureData.options.decodeImage = async value => new Float32Array(256 * 256).fill(value);
  const provider = await createRomaniaTerrain(fixtureData.Cesium, fixtureData.options);
  const [west, east] = await Promise.all([provider.requestTileGeometry(0, 0, 1), provider.requestTileGeometry(1, 0, 1)]);
  for (let row = 0; row < 257; row++) {
    assert.equal(west.buffer[row * 257 + 256], 50);
    assert.equal(east.buffer[row * 257], west.buffer[row * 257 + 256]);
  }
});

test('virtual terrain refines imagery through z19 using only native DEM files', async () => {
  const fixtureData = fixture();
  const nativeRanges = Array.from({ length: 12 }, (_, level) => {
    const nw = terrainPixelPosition(20, 49, level), se = terrainPixelPosition(31, 43, level);
    return { minX: Math.floor((nw.x + 0.5) / 256), maxX: Math.floor((se.x + 0.5) / 256), minY: Math.floor((nw.y + 0.5) / 256), maxY: Math.floor((se.y + 0.5) / 256) };
  });
  fixtureData.options.fetchImpl = async url => {
    fixtureData.requests.push(url);
    return url.endsWith('manifest.json') ? { ok: true, json: async () => ({
      complete: true, format: 'terrarium', tileSize: 256, maximumLevel: 11,
      bounds: [20, 43, 31, 49], coverageTileRanges: nativeRanges, storedTileRanges: nativeRanges,
    }) } : { ok: true, blob: async () => ({}) };
  };
  fixtureData.options.decodeImage = async () => Float32Array.from({ length: 256 * 256 }, (_, i) => 100 + (i % 256) * 0.2 + Math.floor(i / 256) * 0.1);
  const provider = await createRomaniaTerrain(fixtureData.Cesium, fixtureData.options);
  assert.equal(provider.sourceMaximumLevel, 11);
  assert.equal(provider.maximumRenderLevel, 19);
  for (const level of [11, 12, 14, 17, 19]) {
    const point = terrainPixelPosition(26.1, 44.4, level);
    const x = Math.floor((point.x + 0.5) / 256), y = Math.floor((point.y + 0.5) / 256);
    assert.equal(provider.getTileDataAvailable(x, y, level), true);
    const tile = await provider.requestTileGeometry(x, y, level);
    assert.ok(tile.buffer.every(Number.isFinite));
    assert.equal(tile.width, Math.max(2, 256 / 2 ** (level - 11)) + 1);
    assert.equal(tile.childTileMask, level < 19 ? 15 : 0);
    const east = await provider.requestTileGeometry(x + 1, y, level);
    for (let row = 0; row < tile.height; row++) assert.equal(tile.buffer[row * tile.width + tile.width - 1], east.buffer[row * east.width]);
  }
  assert.equal(provider.getTileDataAvailable(0, 0, 19), false, 'virtual coverage stays finite');
  const beyond = await provider.requestTileGeometry(0, 0, 20);
  assert.equal(beyond.childTileMask, 0);
  assert.ok(fixtureData.requests.filter(url => url.endsWith('.png')).every(url => /\/11\/\d+\/\d+\.png$/.test(url)), 'No z12–19 PNG files are requested.');
});
