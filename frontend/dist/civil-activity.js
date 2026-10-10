import { ROMANIA_BOUNDS } from './romania-map.js';
import {
  CELL_LEVEL, TRAFFIC_MIN_LEVEL, activityPixels, bucharestClock, cellActivity, decodeCells, densityAtLevel, groupFactors,
  tileCells, trafficCongestion,
} from './civil-activity-model.js';

const TILE_SIZE = 512;
const CLOCK_REFRESH_MS = 5 * 60_000;
const TRAFFIC_SETTLE_MS = 2_500;
const TRAFFIC_FRESH_MS = 5 * 60_000;
const SWAP_MS = 400; // the previous shading stays until the new tiles have been drawn
const DATA = './civil-data/';

/** Estimated activity layer: mapped venues × hourly profile, optionally raised by live road congestion. */
export function createCivilActivity(Cesium, viewer, {
  onStatus = () => {},
  onLayer = () => {},
  fetch: fetchData = (...args) => globalThis.fetch(...args),
  createCanvas = () => document.createElement('canvas'),
  now = () => new Date(),
  timers = globalThis,
} = {}) {
  let cells, loading, visible = false, disposed = false, layer = null, incoming = null, failure;
  let preview = null, clock, activity, clockTimer, trafficTimer, swapTimer, appliedTraffic = false;
  const levels = new Map(), traffic = new Map();
  const alive = () => !disposed && !viewer.isDestroyed();
  const redraw = () => { if (alive()) viewer.scene.requestRender(); };
  function report(state, message) {
    if (!disposed) onStatus({ state, message, visible, live: preview === null, day: clock?.day, hour: clock?.hour, traffic: appliedTraffic });
  }
  function stopTimers() {
    for (const timer of [clockTimer, trafficTimer, swapTimer]) timers.clearTimeout(timer);
    clockTimer = trafficTimer = swapTimer = undefined;
  }
  function remove(target) { if (target && !viewer.isDestroyed()) viewer.imageryLayers.remove(target, true); }
  function removeLayers() {
    stopTimers();
    remove(layer); remove(incoming);
    layer = incoming = null; redraw();
  }
  function show() {
    swapTimer = undefined;
    remove(layer);
    layer = incoming; incoming = null;
    if (layer) layer.alpha = 1;
    redraw();
  }
  async function load() {
    const request = { mode: 'same-origin', credentials: 'same-origin', redirect: 'error' };
    const manifestResponse = await fetchData(`${DATA}activity.json`, request);
    if (!manifestResponse.ok) throw new Error('Activity manifest unavailable.');
    const manifest = await manifestResponse.json();
    if (manifest.file !== 'activity-cells.bin') throw new Error('Unexpected activity file.');
    const response = await fetchData(`${DATA}${manifest.file}`, request);
    if (!response.ok) throw new Error('Activity cells unavailable.');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== manifest.bytes) throw new Error('Activity cells are incomplete.');
    return decodeCells(buffer, manifest);
  }
  function density(level) {
    if (!levels.has(level)) levels.set(level, densityAtLevel(cells, activity, level));
    return levels.get(level);
  }
  // Finest fresh road measurement covering the centre of a display cell; 0 when there is none.
  function boost(level, x, y) {
    for (let trafficLevel = CELL_LEVEL; trafficLevel >= TRAFFIC_MIN_LEVEL; trafficLevel--) {
      const scale = 2 ** (trafficLevel - level);
      const entry = traffic.get(`${trafficLevel}/${Math.floor((x + 0.5) * scale)}/${Math.floor((y + 0.5) * scale)}`);
      if (entry) { appliedTraffic = true; return entry.congestion; }
    }
    return 0;
  }
  function render(x, y, zoom) {
    const canvas = createCanvas(); canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
    const count = 2 ** zoom;
    if (![x, y, zoom].every(Number.isInteger) || zoom < 0 || zoom > CELL_LEVEL || x < 0 || y < 0 || x >= count || y >= count) return canvas;
    const grid = tileCells(x, y, zoom, TILE_SIZE);
    const before = appliedTraffic;
    const pixels = activityPixels(grid, density(grid.level), preview === null && traffic.size ? boost : undefined);
    if (appliedTraffic !== before) report('ready');
    const source = createCanvas(); source.width = grid.size; source.height = grid.size;
    const sourceContext = source.getContext('2d'), image = sourceContext.createImageData(grid.size, grid.size);
    image.data.set(pixels); sourceContext.putImageData(image, 0, 0);
    const context = canvas.getContext('2d', { alpha: true });
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(source, grid.offsetX, grid.offsetY, grid.size * grid.cellPixels, grid.size * grid.cellPixels);
    return canvas;
  }
  function rebuild() {
    stopTimers();
    remove(incoming); incoming = null;
    if (!alive() || !visible || !cells) { removeLayers(); return; }
    clock = preview ?? bucharestClock(now());
    activity = cellActivity(cells, groupFactors(clock.day, clock.hour));
    levels.clear(); appliedTraffic = false;
    const limit = now().getTime() - TRAFFIC_FRESH_MS;
    for (const [key, entry] of traffic) if (entry.at < limit) traffic.delete(key);
    try {
      incoming = viewer.imageryLayers.addImageryProvider({
        tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, minimumLevel: 0, maximumLevel: CELL_LEVEL,
        rectangle: Cesium.Rectangle.fromDegrees(...ROMANIA_BOUNDS),
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        tileDiscardPolicy: undefined, proxy: undefined, hasAlphaChannel: true,
        errorEvent: new Cesium.Event(),
        credit: new Cesium.Credit('Activitate estimată · locuri © OpenStreetMap', false),
        getTileCredits() { return undefined; },
        pickFeatures() { return undefined; },
        requestImage(x, y, zoom) { return Promise.resolve(render(x, y, zoom)); },
      });
      if (layer) { incoming.alpha = 0.01; swapTimer = timers.setTimeout(show, SWAP_MS); } else show();
      onLayer();
      report('ready');
      if (preview === null) clockTimer = timers.setTimeout(rebuild, CLOCK_REFRESH_MS);
      redraw();
    } catch (error) {
      failure = 'Stratul de activitate nu a putut fi inițializat.';
      removeLayers(); report('error', failure);
      console.error('Civil activity layer:', error);
    }
  }
  async function start() {
    if (cells) { rebuild(); return; }
    if (failure) { report('error', failure); return; }
    report('loading', 'Se încarcă locurile cartate…');
    loading ??= load();
    try {
      const loaded = await loading;
      if (disposed) return;
      cells = loaded; rebuild();
    } catch (error) {
      if (disposed) return;
      failure = 'Pachetul de activitate nu este disponibil. Rulează „npm run prepare:activity”.';
      report('error', failure);
      console.error('Civil activity data:', error);
    }
  }
  report('paused');
  return {
    setVisible(value) {
      if (disposed) return;
      const next = Boolean(value); if (visible === next) return;
      visible = next;
      if (visible) void start(); else { removeLayers(); report('paused'); }
    },
    /** `null` follows the Romanian clock; `{ day, hour }` previews the model without live traffic. */
    setTime(value) {
      if (disposed) return;
      if (value === null) preview = null;
      else if (Number.isInteger(value?.day) && value.day >= 0 && value.day <= 6 && value.hour >= 0 && value.hour < 24) preview = { day: value.day, hour: value.hour };
      else return;
      if (visible && cells) rebuild();
    },
    /** Decoded TomTom flow tile from the traffic layer; redraws once the burst of tiles has settled. */
    ingestTraffic({ x, y, zoom, tile }) {
      if (disposed) return;
      const at = now().getTime();
      let changed = false;
      for (const cell of trafficCongestion(tile, x, y, zoom)) {
        if (cell.level < TRAFFIC_MIN_LEVEL) continue;
        traffic.set(`${cell.level}/${cell.x}/${cell.y}`, { congestion: cell.congestion, at }); changed = true;
      }
      if (!changed || !visible || !cells || preview !== null) return;
      timers.clearTimeout(trafficTimer);
      trafficTimer = timers.setTimeout(rebuild, TRAFFIC_SETTLE_MS);
    },
    clearTraffic() {
      if (disposed || !traffic.size) return;
      traffic.clear();
      if (visible && cells && preview === null) rebuild();
    },
    raise() {
      if (!alive()) return;
      for (const target of [layer, incoming]) if (target) viewer.imageryLayers.raiseToTop(target);
      redraw();
    },
    destroy() {
      if (disposed) return;
      visible = false; removeLayers(); traffic.clear(); disposed = true;
    },
  };
}
