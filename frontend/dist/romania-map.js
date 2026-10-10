/** Offline cartography only. Shortbread 1.0 / Cesium 1.146.0 (pinned). */
import { decompressMapPack } from './brotli-decoder.js';
export const ROMANIA_BOUNDS = Object.freeze([20.24181, 43.61247, 30.27896, 48.26948]);
const TILE_SIZE = 256;
const EMPTY_TILE = Object.freeze({ layers: [] });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function lonLatToTile(longitude, latitude, zoom) {
  const n = 2 ** zoom;
  const radians = clamp(latitude, -85.05112878, 85.05112878) * Math.PI / 180;
  return { x: clamp((longitude + 180) / 360 * n, 0, n), y: clamp((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n, 0, n) };
}

export function tilePointToLonLat(x, y, zoom, point = { x: 0, y: 0 }, extent = 4096) {
  const n = 2 ** zoom;
  return { longitude: (x + point.x / extent) / n * 360 - 180,
    latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + point.y / extent) / n))) * 180 / Math.PI };
}

export function sourceTile(x, y, zoom, maximumZoom = 14) {
  const z = Math.min(zoom, maximumZoom);
  const scale = 2 ** (zoom - z);
  return { x: Math.floor(x / scale), y: Math.floor(y / scale), z, scale, offsetX: x % scale, offsetY: y % scale };
}

export function tileIntersectsBounds(x, y, zoom, bounds = ROMANIA_BOUNDS) {
  const nw = lonLatToTile(bounds[0], bounds[3], zoom);
  const se = lonLatToTile(bounds[2], bounds[1], zoom);
  return x + 1 > nw.x && x < se.x && y + 1 > nw.y && y < se.y;
}

/** Deduplicates in-flight work; settled values use a bounded least-recently-used cache. */
export function createPromiseCache({ maxEntries = 48, maxBytes = Infinity, sizeOf = () => 1 } = {}) {
  const values = new Map();
  const pending = new Map();
  let bytes = 0;
  let generation = 0;
  return {
    get(key, loader) {
      if (values.has(key)) {
        const entry = values.get(key);
        values.delete(key);
        values.set(key, entry);
        return Promise.resolve(entry.value);
      }
      if (pending.has(key)) return pending.get(key);
      const currentGeneration = generation;
      const promise = Promise.resolve().then(loader).then((value) => {
        if (generation !== currentGeneration) return value;
        const size = Math.max(0, sizeOf(value));
        if (size <= maxBytes) {
          values.set(key, { value, size });
          bytes += size;
          while (values.size > maxEntries || bytes > maxBytes) {
            const oldest = values.keys().next().value;
            bytes -= values.get(oldest).size;
            values.delete(oldest);
          }
        }
        return value;
      }).finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
      pending.set(key, promise);
      return promise;
    },
    clear() { generation += 1; values.clear(); pending.clear(); bytes = 0; },
    get size() { return values.size; },
    get bytes() { return bytes; },
    get pending() { return pending.size; },
  };
}

export function validatePackEntry(entry, { maximumBytes = 8 * 1024 * 1024, allowEmpty = false } = {}) {
  if (!Array.isArray(entry) || entry.length !== 3 || !/^\d{6}\.bin$/.test(entry[0])
    || !Number.isSafeInteger(entry[1]) || entry[1] < 0 || !Number.isSafeInteger(entry[2])
    || entry[2] < (allowEmpty ? 0 : 1) || entry[1] + entry[2] > maximumBytes) {
    throw new Error('Indexul local de tile-uri conține o referință invalidă.');
  }
  return entry;
}

export async function createRomaniaStore(Cesium, { baseUrl = './maps/romania/', fetchImpl = fetch, documentUrl = document.baseURI, decompressPack = decompressMapPack } = {}) {
  const base = new URL(baseUrl, documentUrl);
  if (base.origin !== new URL(documentUrl).origin || !['http:', 'https:'].includes(base.protocol)) {
    throw new Error('Datele cartografice trebuie să fie pe aceeași origine.');
  }
  const abort = new AbortController();
  const indexes = createPromiseCache({ maxEntries: 64 });
  const packs = createPromiseCache({ maxEntries: 16, maxBytes: 48 * 1024 * 1024, sizeOf: (value) => value.byteLength });
  const decoded = createPromiseCache({ maxEntries: 80, maxBytes: 64 * 1024 * 1024, sizeOf: (value) => value.estimatedBytes || 1 });
  async function read(path, optional = false) {
    const response = await fetchImpl(new URL(path, base), { credentials: 'same-origin', mode: 'same-origin', redirect: 'error', signal: abort.signal });
    if (response.status === 404 && optional) return null;
    if (!response.ok) throw new Error(`Datele cartografice locale nu sunt disponibile (HTTP ${response.status}).`);
    return response;
  }
  const manifest = await (await read('manifest.json')).json();
  const wholePackCompression = manifest.version === 2 && manifest.compression === 'none' && ['brotli', 'xz'].includes(manifest.packCompression);
  const legacyCompression = (!manifest.version || manifest.version === 1) && manifest.compression === 'gzip';
  const expandedLimit = wholePackCompression ? manifest.maxExpandedPackBytes : 8 * 1024 * 1024;
  if (manifest.format !== 'pbf' || (!wholePackCompression && !legacyCompression) || manifest.minzoom !== 0 || manifest.maxzoom !== 14
    || !Number.isSafeInteger(expandedLimit) || expandedLimit < 1 || expandedLimit > 32 * 1024 * 1024
    || !Array.isArray(manifest.bounds) || manifest.bounds.length !== 4 || !manifest.bounds.every(Number.isFinite)) {
    throw new Error('Manifestul hărții locale nu este compatibil cu pachetul Shortbread.');
  }
  if (typeof Cesium.decodeMVT !== 'function' || (!wholePackCompression && typeof DecompressionStream !== 'function')) {
    throw new Error('Browserul trebuie să accepte DecompressionStream, iar Cesium trebuie să fie versiunea 1.146.0.');
  }
  return {
    manifest,
    async tile(x, y, z) {
      if (![x, y, z].every(Number.isInteger) || z < 0 || z > 14 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return EMPTY_TILE;
      if (!tileIntersectsBounds(x, y, z, manifest.bounds)) return EMPTY_TILE;
      return decoded.get(`${z}/${x}/${y}`, async () => {
        const index = await indexes.get(`${z}/${x}`, async () => {
          const response = await read(`index/${z}/${x}.json`, true);
          return response ? response.json() : {};
        });
        const entry = index[y];
        if (!entry) return EMPTY_TILE;
        const [name, offset, length] = validatePackEntry(entry, { maximumBytes: expandedLimit, allowEmpty: wholePackCompression });
        const pack = await packs.get(name, async () => {
          const body = await (await read(`packs/${name}`)).arrayBuffer();
          if (body.byteLength > 8 * 1024 * 1024) throw new Error('Pachetul cartografic depășește limita locală.');
          if (wholePackCompression) {
            const expanded = await decompressPack(new Uint8Array(body), manifest.packCompression);
            if (!(expanded instanceof Uint8Array) || expanded.byteLength > expandedLimit) throw new Error('Pachetul cartografic expandat depășește limita locală.');
            return expanded.buffer.slice(expanded.byteOffset, expanded.byteOffset + expanded.byteLength);
          }
          return body;
        });
        if (offset + length > pack.byteLength) throw new Error('Pachet cartografic incomplet.');
        let buffer;
        if (wholePackCompression) buffer = pack.slice(offset, offset + length);
        else {
          const stream = new Blob([new Uint8Array(pack, offset, length)]).stream().pipeThrough(new DecompressionStream('gzip'));
          buffer = await new Response(stream).arrayBuffer();
        }
        if (buffer.byteLength > 24 * 1024 * 1024) throw new Error('Tile-ul cartografic depășește limita locală.');
        const result = Cesium.decodeMVT(buffer);
        result.estimatedBytes = buffer.byteLength * 10;
        return result;
      });
    },
    destroy() { abort.abort(); indexes.clear(); packs.clear(); decoded.clear(); },
    get cacheStats() { return { packs: packs.size, packBytes: packs.bytes, tiles: decoded.size, estimatedTileBytes: decoded.bytes }; },
  };
}

const featureBounds = new WeakMap();
function boundsOf(feature) {
  if (featureBounds.has(feature)) return featureBounds.get(feature);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const parts = feature.type === 'Point' ? [feature.geometry] : feature.geometry;
  for (const part of parts) for (const point of part) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  const bounds = [minX, minY, maxX, maxY];
  featureBounds.set(feature, bounds);
  return bounds;
}

const LAND = {
  forest: '#d2dfc6', grass: '#dce7ce', meadow: '#dce7ce', grassland: '#dee8d2', scrub: '#dae4cd',
  park: '#cde0c2', garden: '#cde0c2', village_green: '#cde0c2', recreation_ground: '#d2e3c5', golf_course: '#d2e3c5',
  residential: '#e7e6e1', industrial: '#e2e1e5', commercial: '#e8e3df', retail: '#eae2df', railway: '#dededb',
  farmland: '#efeedc', farmyard: '#e9e5d6', orchard: '#e0e6cd', vineyard: '#e0e6cd',
  sand: '#f2e8c9', beach: '#f2e8c9', bare_rock: '#e2e0db', scree: '#e2e0db', quarry: '#dedbd4',
  wetland: '#d7e3d8', marsh: '#d7e3d8', swamp: '#d7e3d8', wet_meadow: '#d7e3d8',
  cemetery: '#d6ded1', grave_yard: '#d6ded1', allotments: '#d9e3cb', construction: '#e9e2d8',
};
const PATH_KINDS = new Set(['track', 'footway', 'steps', 'path', 'cycleway', 'bridleway']);
const ROAD_PRIORITY = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, unclassified: 4, residential: 4, living_street: 3, service: 2 };

function roadStyle(properties, zoom) {
  const kind = properties.kind || 'residential';
  const major = ['motorway', 'trunk', 'primary'].includes(kind);
  const secondary = ['secondary', 'tertiary'].includes(kind);
  const path = PATH_KINDS.has(kind);
  const rail = properties.rail || ['rail', 'tram', 'light_rail', 'subway', 'narrow_gauge'].includes(kind);
  if (path && zoom < 14) return null;
  const growth = Math.max(0, zoom - 12);
  let width = major ? 1.7 + growth * 1.9 : secondary ? 1.2 + growth * 1.55 : 0.75 + growth * 1.25;
  if (properties.link) width *= 0.7;
  if (path) width = Math.min(3, 0.9 + growth * 0.25);
  if (rail) width = Math.min(3, 0.9 + growth * 0.3);
  if (kind === 'runway') width = 3 + growth * 4;
  return { width, color: rail ? '#7d8589' : path ? '#bbac95' : major ? '#f4d38e' : secondary ? '#fff2c7' : '#ffffff',
    border: major ? '#cfa971' : '#c9c9c1', dash: rail ? [4, 3] : path ? [2, 3] : properties.tunnel ? [4, 3] : [], rail, path };
}

/** Rerenders vector geometry at the requested zoom; never fetches nonexistent z15+ data. */
export function renderShortbreadTile(tile, source, zoom, { createCanvas = () => document.createElement('canvas') } = {}) {
  const canvas = createCanvas();
  canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#f1f0e8'; ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const layers = new Map(tile.layers.map((layer) => [layer.name, layer]));
  const occupied = [];
  function mapper(layer) {
    const scale = TILE_SIZE / layer.extent * source.scale;
    return (point) => ({ x: point.x * scale - source.offsetX * TILE_SIZE, y: point.y * scale - source.offsetY * TILE_SIZE });
  }
  function visible(feature, layer, margin = 10) {
    const b = boundsOf(feature); const scale = TILE_SIZE / layer.extent * source.scale;
    return b[2] * scale - source.offsetX * TILE_SIZE >= -margin && b[0] * scale - source.offsetX * TILE_SIZE <= TILE_SIZE + margin
      && b[3] * scale - source.offsetY * TILE_SIZE >= -margin && b[1] * scale - source.offsetY * TILE_SIZE <= TILE_SIZE + margin;
  }
  function path(feature, layer) {
    const project = mapper(layer);
    ctx.beginPath();
    for (const ring of feature.geometry) {
      for (let i = 0; i < ring.length; i += 1) {
        const p = project(ring[i]);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      if (feature.type === 'Polygon') ctx.closePath();
    }
  }
  function polygons(name, fill, stroke = null) {
    const layer = layers.get(name); if (!layer) return;
    for (const feature of layer.features) {
      if (feature.type !== 'Polygon' || !visible(feature, layer)) continue;
      const color = typeof fill === 'function' ? fill(feature.properties) : fill;
      if (!color) continue;
      path(feature, layer); ctx.fillStyle = color; ctx.fill('evenodd');
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.55; ctx.stroke(); }
    }
  }
  polygons('land', (p) => LAND[p.kind] || '#e9e9df');
  polygons('ocean', '#aad1df');
  polygons('water_polygons', (p) => p.kind === 'glacier' ? '#eaf3f3' : '#aad1df');
  polygons('sites', (p) => p.kind === 'parking' ? '#e1e2df' : p.kind === 'sports_centre' ? '#d2e3c5' : '#e9e5dc');
  polygons('street_polygons', '#f8f8f5');
  for (const name of ['water_lines', 'boundaries', 'ferries']) {
    const layer = layers.get(name); if (!layer) continue;
    for (const feature of layer.features) {
      if (feature.type !== 'LineString' || !visible(feature, layer)) continue;
      if (name === 'boundaries' && Number(feature.properties.admin_level) > 4 && zoom < 10) continue;
      ctx.strokeStyle = name === 'boundaries' ? '#9f92ad' : '#86b7ce';
      ctx.lineWidth = name === 'boundaries' ? (Number(feature.properties.admin_level) === 2 ? 1.5 : 0.8) : Math.max(0.7, (zoom - 9) * 0.45);
      ctx.setLineDash(name === 'boundaries' ? [4, 3] : name === 'ferries' ? [3, 3] : []);
      path(feature, layer); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  if (zoom >= 14) polygons('buildings', '#d3c8bc', zoom >= 16 ? '#b7aa9c' : null);
  const roads = layers.get('streets');
  if (roads) {
    const features = roads.features.filter((feature) => feature.type === 'LineString' && visible(feature, roads, 25))
      .sort((a, b) => (Number(a.properties.bridge) || 0) - (Number(b.properties.bridge) || 0)
        || (ROAD_PRIORITY[a.properties.kind] || 0) - (ROAD_PRIORITY[b.properties.kind] || 0));
    for (const casing of [true, false]) for (const feature of features) {
      const style = roadStyle(feature.properties, zoom); if (!style || (casing && (style.path || style.rail))) continue;
      path(feature, roads); ctx.setLineDash(casing ? [] : style.dash);
      ctx.strokeStyle = casing ? style.border : style.color;
      ctx.lineWidth = style.width + (casing ? (zoom >= 12 ? 1.2 : 0.55) : 0);
      ctx.globalAlpha = feature.properties.tunnel ? 0.65 : 1; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);

  function label(text, point, { size = 11, color = '#374753', weight = '400', angle = 0, halo = '#fbfbf6', spacing = 3 } = {}) {
    text = String(text || '').trim().slice(0, 100); if (!text) return false;
    if (point.x < -80 || point.x > TILE_SIZE + 80 || point.y < -30 || point.y > TILE_SIZE + 30) return false;
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    const width = ctx.measureText(text).width;
    const w = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * size;
    const h = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * size;
    const box = [point.x - w / 2 - spacing, point.y - h / 2 - spacing, point.x + w / 2 + spacing, point.y + h / 2 + spacing];
    if (occupied.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return false;
    occupied.push(box);
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(angle); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.strokeText(text, 0, 0); ctx.fillStyle = color; ctx.fillText(text, 0, 0); ctx.restore();
    return true;
  }
  const places = layers.get('place_labels');
  if (places) for (const feature of places.features) {
    if (feature.type !== 'Point' || !visible(feature, places, 100)) continue;
    const p = feature.properties; const kind = p.kind;
    const city = ['capital', 'state_capital', 'city'].includes(kind);
    if ((kind === 'town' && zoom < 8) || (['village', 'hamlet'].includes(kind) && zoom < 10)
      || (!city && kind !== 'town' && zoom < 11) || (zoom > 14 && city)) continue;
    const size = kind === 'capital' ? 15 : city ? 13 : kind === 'town' ? 12 : 11;
    const point = mapper(places)(feature.geometry[0]);
    label(p['name:ro'] || p.name || p.name_en, point, { size, weight: city ? '650' : '500', color: city ? '#263a46' : '#4f5e63', spacing: city ? 6 : 4 });
  }
  const boundaries = layers.get('boundary_labels');
  if (boundaries && zoom <= 8) for (const feature of boundaries.features) {
    if (feature.type !== 'Point' || !visible(feature, boundaries, 100)) continue;
    const p = feature.properties; if (Number(p.admin_level) !== 2 || zoom > 6) continue;
    label((p.name || p.name_en || '').toLocaleUpperCase('ro'), mapper(boundaries)(feature.geometry[0]), { size: 13, color: '#73766c', weight: '600', spacing: 7 });
  }
  function lineLabels(name, water = false) {
    const layer = layers.get(name); if (!layer) return;
    for (const feature of layer.features) {
      if (feature.type !== 'LineString' || !visible(feature, layer, 60)) continue;
      const properties = feature.properties;
      const text = water ? properties.name : (zoom < 13 ? properties.ref : properties.name || properties.ref);
      if (!text || (!water && PATH_KINDS.has(properties.kind) && zoom < 17)) continue;
      const project = mapper(layer); let best = null;
      for (const line of feature.geometry) for (let i = 1; i < line.length; i += 1) {
        const a = project(line[i - 1]); const b = project(line[i]);
        const x = (a.x + b.x) / 2; const y = (a.y + b.y) / 2;
        if (x < 4 || x > TILE_SIZE - 4 || y < 4 || y > TILE_SIZE - 4) continue;
        const length = Math.hypot(a.x - b.x, a.y - b.y);
        if (!best || length > best.length) best = { x, y, length, angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
      if (!best) continue;
      const size = zoom >= 16 ? 11 : 10;
      ctx.font = `400 ${size}px system-ui, sans-serif`;
      if (best.length < Math.min(150, ctx.measureText(String(text)).width * 0.85)) continue;
      if (best.angle > Math.PI / 2) best.angle -= Math.PI;
      if (best.angle < -Math.PI / 2) best.angle += Math.PI;
      label(String(text).split('\n')[0], best, { size, angle: best.angle, color: water ? '#53819a' : '#556268', spacing: 3 });
    }
  }
  lineLabels('street_labels');
  if (zoom >= 12) lineLabels('water_lines_labels', true);
  const waterLabels = layers.get('water_polygons_labels');
  if (waterLabels && zoom >= 10) for (const feature of waterLabels.features) {
    if (feature.type === 'Point' && visible(feature, waterLabels)) label(feature.properties.name, mapper(waterLabels)(feature.geometry[0]), { size: 10, color: '#517c92' });
  }
  if (zoom >= 16) for (const name of ['pois', 'public_transport']) {
    const layer = layers.get(name); if (!layer) continue;
    for (const feature of layer.features) {
      if (feature.type !== 'Point' || !visible(feature, layer)) continue;
      const p = feature.properties; const text = p.name || p['name:ro'];
      if (!text) continue;
      label(text, mapper(layer)(feature.geometry[0]), { size: 10, color: '#6a777b', spacing: 4 });
    }
  }
  if (zoom >= 17) {
    const addresses = layers.get('addresses');
    if (addresses) for (const feature of addresses.features) {
      if (feature.type !== 'Point' || !visible(feature, addresses)) continue;
      label(feature.properties.housenumber || feature.properties.housename, mapper(addresses)(feature.geometry[0]), { size: 9, color: '#877968', halo: '#f3eee6', spacing: 1 });
    }
  }
  return canvas;
}

export function createRomaniaImagery(Cesium, store) {
  let pending = 0;
  return {
    tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, minimumLevel: 0, maximumLevel: 19,
    rectangle: Cesium.Rectangle.fromDegrees(...store.manifest.bounds),
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    tileDiscardPolicy: undefined, proxy: undefined, hasAlphaChannel: false,
    errorEvent: new Cesium.Event(),
    credit: new Cesium.Credit('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · Shortbread / Geofabrik · date locale', true),
    getTileCredits() { return undefined; },
    pickFeatures() { return undefined; },
    requestImage(x, y, level) {
      if (pending >= 12) return undefined;
      pending += 1;
      const source = sourceTile(x, y, level, store.manifest.maxzoom);
      return store.tile(source.x, source.y, source.z).then((tile) => renderShortbreadTile(tile, source, level)).finally(() => { pending -= 1; });
    },
  };
}

export function signedRingArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) sum += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  return sum / 2;
}

/** MVT outer rings and holes have opposite winding; multiple outer rings are supported. */
export function groupPolygonRings(rings) {
  const groups = []; let outerSign;
  for (const ring of rings) {
    if (ring.length < 4) continue;
    const area = signedRingArea(ring); if (Math.abs(area) < 0.01) continue;
    const sign = Math.sign(area); outerSign ??= sign;
    if (sign === outerSign) groups.push({ outer: ring, holes: [] });
    else if (groups.length) groups[groups.length - 1].holes.push(ring);
  }
  return groups;
}

/** Clips buffered footprints to their owner tile to avoid duplicate overlapping walls. */
export function clipRingToTile(input, extent) {
  let ring = input;
  const edges = [
    { inside: (p) => p.x >= 0, intersect: (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * -a.x / (b.x - a.x) }) },
    { inside: (p) => p.x <= extent, intersect: (a, b) => ({ x: extent, y: a.y + (b.y - a.y) * (extent - a.x) / (b.x - a.x) }) },
    { inside: (p) => p.y >= 0, intersect: (a, b) => ({ x: a.x + (b.x - a.x) * -a.y / (b.y - a.y), y: 0 }) },
    { inside: (p) => p.y <= extent, intersect: (a, b) => ({ x: a.x + (b.x - a.x) * (extent - a.y) / (b.y - a.y), y: extent }) },
  ];
  for (const edge of edges) {
    const output = []; if (!ring.length) break;
    let a = ring[ring.length - 1];
    for (const b of ring) {
      const aIn = edge.inside(a); const bIn = edge.inside(b);
      if (aIn !== bIn) output.push(edge.intersect(a, b));
      if (bIn) output.push(b); a = b;
    }
    ring = output;
  }
  const clean = ring.filter((p, i) => i === 0 || p.x !== ring[i - 1].x || p.y !== ring[i - 1].y);
  if (clean.length > 1 && clean[0].x === clean[clean.length - 1].x && clean[0].y === clean[clean.length - 1].y) clean.pop();
  return clean.length >= 3 && Math.abs(signedRingArea(clean)) > 0.01 ? clean : [];
}

/** Ordinary schematic building volumes, unrelated to the monitoring demonstration. */
export function createRomaniaBuildings(Cesium, viewer, store, getTerrain = () => null) {
  const primitives = new Map();
  const loading = new Set();
  const failed = new Set();
  const collection = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
  let wanted = new Set(); let enabled = true; let disposed = false; let limited = false; let timer;
  const maxTiles = 9; const maxBuildingsPerTile = 2500;
  async function loadTile(item) {
    const { x, y, z, key } = item; loading.add(key);
    try {
      const tile = await store.tile(x, y, z);
      if (!wanted.has(key) || disposed || !enabled) return;
      const layer = tile.layers.find((candidate) => candidate.name === 'buildings');
      if (!layer) { primitives.set(key, null); return; }
      const groups = [];
      for (const feature of layer.features) {
        if (feature.type !== 'Polygon') continue;
        for (const group of groupPolygonRings(feature.geometry)) {
          const outer = clipRingToTile(group.outer, layer.extent); if (!outer.length) continue;
          const holes = group.holes.map((ring) => clipRingToTile(ring, layer.extent)).filter((ring) => ring.length > 2);
          const center = outer.reduce((p, point) => ({ x: p.x + point.x / outer.length, y: p.y + point.y / outer.length }), { x: 0, y: 0 });
          groups.push({ outer, holes, center: tilePointToLonLat(x, y, z, center, layer.extent) });
        }
      }
      if (groups.length > maxBuildingsPerTile) limited = true;
      const selected = groups.slice(0, maxBuildingsPerTile);
      const terrain = getTerrain();
      const heights = terrain?.sampleHeights ? await terrain.sampleHeights(selected.map((group) => group.center)) : selected.map(() => 0);
      if (!wanted.has(key) || disposed || !enabled) return;
      const positions = (ring) => ring.map((point) => {
        const ll = tilePointToLonLat(x, y, z, point, layer.extent);
        return Cesium.Cartesian3.fromDegrees(ll.longitude, ll.latitude);
      });
      const instances = selected.map((group, index) => {
        const base = Number.isFinite(heights[index]) ? heights[index] : 0;
        return new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(positions(group.outer), group.holes.map((ring) => new Cesium.PolygonHierarchy(positions(ring)))),
            height: base, extrudedHeight: base + 9, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString('#dfd3c1')) },
        });
      });
      if (instances.length) {
        const primitive = collection.add(new Cesium.Primitive({ geometryInstances: instances,
          appearance: new Cesium.PerInstanceColorAppearance({ closed: true, translucent: false }),
          asynchronous: true, allowPicking: false, releaseGeometryInstances: true }));
        primitives.set(key, primitive);
      } else primitives.set(key, null);
      viewer.scene.requestRender();
    } catch (error) {
      if (!disposed && error.name !== 'AbortError') { failed.add(key); console.warn('Clădirile schematice locale nu pot fi încărcate.', error); }
    } finally { loading.delete(key); }
  }
  function clear() {
    wanted.clear();
    for (const primitive of primitives.values()) if (primitive) collection.remove(primitive);
    primitives.clear(); limited = false;
  }
  function update() {
    if (disposed || !enabled || viewer.scene.mode !== Cesium.SceneMode.SCENE3D) { clear(); return; }
    const cameraHeight = viewer.camera.positionCartographic.height;
    const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rectangle || cameraHeight > 7500) { clear(); return; }
    const bounds = [Cesium.Math.toDegrees(rectangle.west), Cesium.Math.toDegrees(rectangle.south), Cesium.Math.toDegrees(rectangle.east), Cesium.Math.toDegrees(rectangle.north)];
    if (bounds[0] > bounds[2]) { clear(); return; }
    const nw = lonLatToTile(Math.max(bounds[0], ROMANIA_BOUNDS[0]), Math.min(bounds[3], ROMANIA_BOUNDS[3]), 14);
    const se = lonLatToTile(Math.min(bounds[2], ROMANIA_BOUNDS[2]), Math.max(bounds[1], ROMANIA_BOUNDS[1]), 14);
    if (nw.x > se.x || nw.y > se.y) { clear(); return; }
    const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2));
    const position = ray && viewer.scene.globe.pick(ray, viewer.scene);
    const center = position ? Cesium.Cartographic.fromCartesian(position) : viewer.camera.positionCartographic;
    const centerTile = lonLatToTile(Cesium.Math.toDegrees(center.longitude), Cesium.Math.toDegrees(center.latitude), 14);
    const candidates = [];
    const minX = Math.max(Math.floor(nw.x), Math.floor(centerTile.x) - 3);
    const maxX = Math.min(Math.floor(se.x), Math.floor(centerTile.x) + 3);
    const minY = Math.max(Math.floor(nw.y), Math.floor(centerTile.y) - 3);
    const maxY = Math.min(Math.floor(se.y), Math.floor(centerTile.y) + 3);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      candidates.push({ x, y, z: 14, key: `14/${x}/${y}`, distance: Math.hypot(x + 0.5 - centerTile.x, y + 0.5 - centerTile.y) });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = candidates.slice(0, maxTiles); wanted = new Set(selected.map((item) => item.key));
    limited = candidates.length > maxTiles;
    for (const [key, primitive] of primitives) if (!wanted.has(key)) {
      if (primitive) collection.remove(primitive); primitives.delete(key);
    }
    // At most three tile builds at once; later moveEnd/update resumes the queue.
    const queue = selected.filter((item) => !primitives.has(item.key) && !loading.has(item.key) && !failed.has(item.key));
    const slots = Math.max(0, 3 - loading.size);
    for (const item of queue.slice(0, slots)) void loadTile(item).finally(() => {
      if (!disposed && enabled) { clearTimeout(timer); timer = setTimeout(update, 120); }
    });
    viewer.scene.requestRender();
  }
  return {
    update,
    setEnabled(value) { enabled = value; if (enabled) update(); else clear(); },
    getState: () => ({ enabled, tiles: primitives.size, loading: loading.size, limited, estimatedHeightMeters: 9 }),
    destroy() { disposed = true; clearTimeout(timer); clear(); viewer.scene.primitives.remove(collection); },
  };
}
