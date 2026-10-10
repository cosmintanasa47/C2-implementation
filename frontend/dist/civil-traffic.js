import { ROMANIA_BOUNDS } from './romania-map.js';

export const TRAFFIC_COLORS = Object.freeze({ green: '#3ca66b', yellow: '#e1bb40', red: '#d95650', unknown: '#68747d', closure: '#68747d' });
const TILE_SIZE = 512;
const REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT = 4;
const MAX_TILE_BYTES = 8 * 1024 * 1024;
const ENDPOINT = 'https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile';
// Same-origin relay of the local server: the key is read there from .env and never reaches the page.
const SERVER_ENDPOINT = './api/civil/traffic/flow';

// Presentation thresholds for current speed / free-flow speed, not vehicle counts.
export function trafficBand(relativeSpeed) {
  if (typeof relativeSpeed !== 'number' || !Number.isFinite(relativeSpeed) || relativeSpeed < 0 || relativeSpeed > 1) return 'unknown';
  return relativeSpeed >= 0.75 ? 'green' : relativeSpeed >= 0.4 ? 'yellow' : 'red';
}

/** Draw only provider road geometry. Missing speeds never become free-flow roads. */
export function renderTrafficTile(tile, zoom, { createCanvas = () => document.createElement('canvas') } = {}) {
  if (!Array.isArray(tile?.layers)) throw new Error('Invalid traffic tile.');
  const canvas = createCanvas(); canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const layer of tile.layers) {
    if (layer.name !== 'Traffic flow') continue;
    if (!(layer.extent > 0) || !Number.isFinite(layer.extent) || !Array.isArray(layer.features)) throw new Error('Invalid traffic layer.');
    const scale = TILE_SIZE / layer.extent;
    for (const feature of layer.features) {
      if (feature.type !== 'LineString' || !Array.isArray(feature.geometry)) continue;
      const properties = feature.properties || {};
      const closed = properties.road_closure === true;
      const band = trafficBand(properties.relative_speed);
      if (!closed && band === 'unknown') continue;
      const major = /^(motorway|trunk|primary)(?:_link)?$/.test(properties.road_category || '');
      const width = (major ? 7 : 5) + Math.min(3, Math.max(0, zoom - 13) * 0.6);
      ctx.beginPath();
      for (const line of feature.geometry) {
        if (!Array.isArray(line)) continue;
        let started = false;
        for (const point of line) {
          if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) { started = false; continue; }
          if (started) ctx.lineTo(point.x * scale, point.y * scale);
          else { ctx.moveTo(point.x * scale, point.y * scale); started = true; }
        }
      }
      ctx.setLineDash(closed ? [10, 8] : []);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = width + 2.5; ctx.stroke();
      ctx.strokeStyle = TRAFFIC_COLORS[closed ? 'closure' : band]; ctx.lineWidth = width; ctx.stroke();
    }
  }
  return canvas;
}

/** Optional road traffic for the civilian map. A typed key lives only in this closure; a server key never reaches it. */
export function createCivilTraffic(Cesium, viewer, {
  onStatus = () => {},
  onTile = () => {},
  fetch: fetchTile = (...args) => globalThis.fetch(...args),
  createCanvas = () => document.createElement('canvas'),
  visibilityDocument = globalThis.document,
  timers = globalThis,
} = {}) {
  let apiKey = null, viaServer = false, visible = false, disposed = false, cycle = null, pending = 0;
  let refreshTimer, receivedAt, failureMessage;
  const hidden = () => Boolean(visibilityDocument?.hidden);
  const alive = () => !disposed && !viewer.isDestroyed();
  const connected = () => viaServer || Boolean(apiKey);
  function redraw() { if (alive()) viewer.scene.requestRender(); }
  function report(state, message) {
    if (!disposed) onStatus({ state, message, receivedAt, connected: connected(), managed: viaServer, visible });
  }
  function blank() { const canvas = createCanvas(); canvas.width = TILE_SIZE; canvas.height = TILE_SIZE; return canvas; }
  function stopCycle() {
    timers.clearTimeout(refreshTimer); refreshTimer = undefined;
    const previous = cycle; cycle = null;
    if (previous) {
      previous.abort.abort();
      for (const timeout of previous.timeouts) timers.clearTimeout(timeout);
      previous.timeouts.clear();
      if (!viewer.isDestroyed() && previous.layer) viewer.imageryLayers.remove(previous.layer, true);
    }
    redraw();
  }
  function fail(message, sourceCycle) {
    if (sourceCycle !== cycle || !alive()) return;
    failureMessage = message;
    stopCycle();
    report('error', message);
  }
  function errorMessage(status) {
    if (status === 401 || status === 403) return viaServer ? 'Cheia TomTom din .env nu este autorizată pentru acest serviciu. Corecteaz-o și repornește serverul.' : 'Cheia TomTom nu este autorizată pentru acest serviciu. Verifică accesul și reconectează.';
    if (status === 429) return 'Limita TomTom a fost atinsă. Cererile sunt oprite; reîncearcă mai târziu.';
    return 'Traficul TomTom nu este disponibil. Cererile sunt oprite; poți reîncerca manual.';
  }
  function raise() {
    if (alive() && cycle?.layer) { viewer.imageryLayers.raiseToTop(cycle.layer); redraw(); }
  }
  function startCycle() {
    stopCycle();
    if (!alive()) return;
    if (!connected()) { report('disconnected', 'TomTom neconectat.'); return; }
    if (!visible || hidden()) { report('paused', hidden() ? 'Actualizarea este suspendată cât timp pagina este ascunsă.' : 'Stratul Trafic este oprit.'); return; }
    if (failureMessage) { report('error', failureMessage); return; }
    const current = { abort: new AbortController(), layer: null, timeouts: new Set() };
    cycle = current;
    const isCurrent = () => cycle === current && !current.abort.signal.aborted && alive();
    const provider = {
      tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, minimumLevel: 0, maximumLevel: 22,
      rectangle: Cesium.Rectangle.fromDegrees(...ROMANIA_BOUNDS),
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      tileDiscardPolicy: undefined, proxy: undefined, hasAlphaChannel: true,
      errorEvent: new Cesium.Event(),
      credit: new Cesium.Credit('© <a href="https://www.tomtom.com/" target="_blank" rel="noopener">TomTom</a> · trafic rutier', true),
      getTileCredits() { return undefined; },
      pickFeatures() { return undefined; },
      requestImage(x, y, zoom) {
        if (!isCurrent() || !visible || hidden() || pending >= MAX_CONCURRENT) return undefined;
        const count = 2 ** zoom;
        if (![x, y, zoom].every(Number.isInteger) || zoom < 0 || zoom > 22 || x < 0 || y < 0 || x >= count || y >= count) return Promise.resolve(blank());
        pending += 1;
        const timeout = timers.setTimeout(() => fail('TomTom nu a răspuns la timp. Cererile sunt oprite; poți reîncerca manual.', current), REQUEST_TIMEOUT_MS);
        current.timeouts.add(timeout);
        return (async () => {
          try {
            const accept = { Accept: 'application/vnd.mapbox-vector-tile' };
            const response = await fetchTile(viaServer ? `${SERVER_ENDPOINT}/${zoom}/${x}/${y}` : `${ENDPOINT}/${zoom}/${x}/${y}?apiVersion=2`, {
              headers: viaServer ? accept : { 'TomTom-Api-Key': apiKey, ...accept },
              mode: viaServer ? 'same-origin' : 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: current.abort.signal,
            });
            if (!isCurrent()) return blank();
            if (!response.ok) { fail(errorMessage(response.status), current); return blank(); }
            const declaredLength = Number(response.headers?.get('content-length'));
            if (declaredLength > MAX_TILE_BYTES) throw new Error('Oversized traffic tile.');
            const body = await response.arrayBuffer();
            if (!isCurrent()) return blank();
            if (body.byteLength > MAX_TILE_BYTES) throw new Error('Oversized traffic tile.');
            const tile = Cesium.decodeMVT(body);
            const canvas = renderTrafficTile(tile, zoom, { createCanvas });
            if (!isCurrent()) return blank();
            // Other layers may reuse the decoded measurements; their errors are not TomTom failures.
            try { onTile({ x, y, zoom, tile }); } catch (error) { console.error('Traffic tile consumer:', error); }
            receivedAt = new Date().toISOString();
            report('ready', 'Trafic TomTom activ · reîmprospătare la 60 s.');
            redraw();
            return canvas;
          } catch {
            // Never surface fetch errors: a transport error may include credentials.
            if (isCurrent()) fail(errorMessage(), current);
            return blank();
          } finally {
            timers.clearTimeout(timeout); current.timeouts.delete(timeout); pending -= 1;
          }
        })();
      },
    };
    try {
      current.layer = viewer.imageryLayers.addImageryProvider(provider);
      raise();
      report('loading', 'Se încarcă traficul TomTom…');
      refreshTimer = timers.setTimeout(() => { if (isCurrent()) startCycle(); }, REFRESH_MS);
    } catch {
      fail('Stratul de trafic nu a putut fi inițializat.', current);
    }
  }
  function visibilityChanged() {
    if (!connected() || !visible || disposed) return;
    startCycle();
  }
  visibilityDocument?.addEventListener('visibilitychange', visibilityChanged);
  report('disconnected', 'TomTom neconectat.');
  return {
    get connected() { return connected(); },
    connect(key) {
      if (disposed) return false;
      const value = typeof key === 'string' ? key.trim() : '';
      if (!value || value.length > 512 || /[\s\x00-\x1f\x7f]/.test(value)) {
        report('error', 'Introdu o cheie API TomTom validă.'); return false;
      }
      apiKey = value; viaServer = false; visible = true; failureMessage = undefined; receivedAt = undefined;
      startCycle(); return true;
    },
    /** Use the key configured on the local server; nothing secret is held by the page. */
    connectViaServer() {
      if (disposed) return false;
      apiKey = null; viaServer = true; visible = true; failureMessage = undefined; receivedAt = undefined;
      startCycle(); return true;
    },
    setVisible(value) {
      if (disposed) return;
      const next = Boolean(value); if (visible === next) return;
      visible = next; startCycle();
    },
    refresh() {
      if (disposed) return;
      failureMessage = undefined; startCycle();
    },
    disconnect() {
      if (disposed) return;
      apiKey = null; viaServer = false; visible = false; receivedAt = undefined; failureMessage = undefined;
      stopCycle(); report('disconnected', 'TomTom neconectat.');
    },
    raise,
    destroy() {
      if (disposed) return;
      apiKey = null; viaServer = false; visible = false;
      visibilityDocument?.removeEventListener('visibilitychange', visibilityChanged);
      stopCycle(); disposed = true;
    },
  };
}
