import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMVT } from 'cesium';
import { createCivilTraffic, renderTrafficTile, trafficBand, TRAFFIC_COLORS } from '../dist/civil-traffic.js';

function canvas() {
  const strokes = [], paths = [];
  const context = {
    beginPath() {}, moveTo(x, y) { paths.push(['move', x, y]); }, lineTo(x, y) { paths.push(['line', x, y]); },
    setLineDash(dash) { this.dash = dash; },
    stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth, dash: [...this.dash] }); },
  };
  return { strokes, paths, getContext: () => context };
}
const line = properties => ({ type: 'LineString', geometry: [[{ x: 100, y: 200 }, { x: 300, y: 400 }]], properties });
const tile = features => ({ layers: [{ name: 'Traffic flow', extent: 4096, features }] });
const response = (status = 200) => ({ ok: status === 200, status, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(1) });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function setup({ fetch: fetchTile = async () => response(), decode = () => tile([line({ relative_speed: 0.8 })]), onTile } = {}) {
  let nextTimer = 0;
  const scheduled = new Map(), layers = [], removed = [], statuses = [], requests = [], visibilityDocument = new EventTarget();
  visibilityDocument.hidden = false;
  const timers = {
    setTimeout(fn, delay) { const id = ++nextTimer; scheduled.set(id, { fn, delay }); return id; },
    clearTimeout(id) { scheduled.delete(id); },
    run(delay) { for (const [id, item] of [...scheduled]) if (item.delay === delay) { scheduled.delete(id); item.fn(); } },
  };
  const Cesium = {
    Rectangle: { fromDegrees: (...args) => args },
    WebMercatorTilingScheme: class {}, Event: class {}, Credit: class {}, decodeMVT: decode,
  };
  let renders = 0, raised = 0;
  const viewer = {
    isDestroyed: () => false,
    scene: { requestRender() { renders++; } },
    imageryLayers: {
      addImageryProvider(provider) { const layer = { provider }; layers.push(layer); return layer; },
      remove(layer) { removed.push(layer); layers.splice(layers.indexOf(layer), 1); },
      raiseToTop() { raised++; },
    },
  };
  const controller = createCivilTraffic(Cesium, viewer, {
    fetch: (...args) => { requests.push(args); return fetchTile(...args); }, createCanvas: canvas,
    onStatus: state => statuses.push(state), visibilityDocument, timers, ...(onTile ? { onTile } : {}),
  });
  return {
    controller, layers, removed, statuses, requests, scheduled, timers,
    provider: () => layers.at(-1)?.provider,
    get renders() { return renders; }, get raised() { return raised; },
    hide(value) { visibilityDocument.hidden = value; visibilityDocument.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('speed colors have exact three-band boundaries and invalid values never become green', () => {
  for (const value of [0, 0.399]) assert.equal(trafficBand(value), 'red');
  for (const value of [0.4, 0.749]) assert.equal(trafficBand(value), 'yellow');
  for (const value of [0.75, 1]) assert.equal(trafficBand(value), 'green');
  for (const value of [null, undefined, '0.8', NaN, Infinity, -0.01, 1.01]) assert.equal(trafficBand(value), 'unknown');
});

test('renderer follows provided geometry and omits missing speeds while showing dashed closures', () => {
  const rendered = renderTrafficTile(tile([
    line({ relative_speed: 0.9 }), line({ relative_speed: 0.5 }), line({ relative_speed: 0.2 }),
    line({}), line({ relative_speed: '0.9' }), line({ road_closure: true, relative_speed: 0.9 }),
  ]), 14, { createCanvas: canvas });
  const colors = rendered.strokes.filter(stroke => stroke.color !== '#ffffff');
  assert.deepEqual(colors.map(stroke => stroke.color), [TRAFFIC_COLORS.green, TRAFFIC_COLORS.yellow, TRAFFIC_COLORS.red, TRAFFIC_COLORS.closure]);
  assert.deepEqual(colors[0].dash, []);
  assert.deepEqual(colors[3].dash, [10, 8]);
  assert.deepEqual(rendered.paths[0], ['move', 12.5, 25]);
  assert.deepEqual(rendered.paths[1], ['line', 37.5, 50]);
});

test('bundled Cesium decodes a binary MVT into the geometry and speed used by the renderer', () => {
  // MVT v2: Traffic flow / extent 4096; a line from (100,200) to (300,400), relative_speed = double 0.8.
  const fixture = Uint8Array.from(Buffer.from('1a420a0c5472616666696320666c6f771212120200001802220a09c80190030a900390031a0e72656c61746976655f73706565642209199a9999999999e93f2880207802', 'hex'));
  const decoded = decodeMVT(fixture.buffer);
  assert.equal(decoded.layers[0].name, 'Traffic flow');
  assert.equal(decoded.layers[0].features[0].type, 'LineString');
  assert.equal(decoded.layers[0].features[0].properties.relative_speed, 0.8);
  const rendered = renderTrafficTile(decoded, 14, { createCanvas: canvas });
  assert.deepEqual(rendered.paths, [['move', 12.5, 25], ['line', 37.5, 50]]);
  assert.equal(rendered.strokes.at(-1).color, TRAFFIC_COLORS.green);
  const empty = renderTrafficTile(decodeMVT(new ArrayBuffer(0)), 14, { createCanvas: canvas });
  assert.deepEqual(empty.strokes, [], 'An empty tile cannot fabricate measured free-flow roads.');
});

test('no provider or network before connection; key is sent only in a request header', async t => {
  const env = setup(); t.after(() => env.controller.destroy());
  assert.equal(env.controller.connected, false);
  assert.equal(env.layers.length, 0);
  assert.equal(env.controller.connect('test-key'), true);
  assert.equal(env.requests.length, 0);
  assert.equal(env.statuses.at(-1).state, 'loading');
  await env.provider().requestImage(18, 11, 5);
  const [url, options] = env.requests[0];
  assert.equal(url, 'https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/5/18/11?apiVersion=2');
  assert.equal(options.headers['TomTom-Api-Key'], 'test-key');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(url.includes('test-key'), false);
  assert.equal(env.statuses.at(-1).state, 'ready');
  assert.ok(env.statuses.at(-1).receivedAt);
  assert.equal(JSON.stringify(env.statuses).includes('test-key'), false);
  assert.ok(env.renders > 0);
  env.controller.raise(); assert.ok(env.raised >= 2);
});

test('concurrency is bounded, with Cesium backpressure instead of an unbounded queue', async t => {
  const waiting = [];
  const env = setup({ fetch: () => { const item = deferred(); waiting.push(item); return item.promise; } });
  t.after(() => env.controller.destroy()); env.controller.connect('test-key');
  const provider = env.provider();
  const pending = [0, 1, 2, 3].map(x => provider.requestImage(x, 0, 4));
  assert.equal(provider.requestImage(4, 0, 4), undefined);
  assert.equal(env.requests.length, 4);
  for (const item of waiting) item.resolve(response());
  await Promise.all(pending);
  const next = provider.requestImage(4, 0, 4);
  assert.equal(env.requests.length, 5);
  waiting.at(-1).resolve(response()); await next;
});

for (const status of [401, 403, 429, 503]) test(`HTTP ${status} stops requests and automatic retries until explicit refresh`, async t => {
  const env = setup({ fetch: async () => response(status) });
  t.after(() => env.controller.destroy()); env.controller.connect('private-key');
  const provider = env.provider();
  await provider.requestImage(0, 0, 0);
  assert.equal(env.statuses.at(-1).state, 'error');
  assert.equal(env.layers.length, 0);
  assert.equal(env.scheduled.size, 0);
  assert.equal(provider.requestImage(0, 0, 0), undefined);
  env.hide(true); env.hide(false); env.timers.run(60_000);
  assert.equal(env.requests.length, 1);
  assert.equal(env.layers.length, 0);
  env.controller.refresh();
  assert.equal(env.layers.length, 1);
  assert.equal(env.statuses.at(-1).state, 'loading');
  assert.equal(JSON.stringify(env.statuses).includes('private-key'), false);
});

test('refresh aborts previous requests and ignores stale completions', async t => {
  const waiting = deferred();
  const env = setup({ fetch: () => waiting.promise });
  t.after(() => env.controller.destroy()); env.controller.connect('test-key');
  const oldProvider = env.provider();
  const pending = oldProvider.requestImage(0, 0, 0);
  env.timers.run(60_000);
  assert.equal(env.requests[0][1].signal.aborted, true);
  assert.equal(env.removed.length, 1);
  assert.notEqual(env.provider(), oldProvider);
  waiting.resolve(response()); await pending;
  assert.equal(env.statuses.at(-1).state, 'loading');
  assert.equal(env.statuses.some(state => state.state === 'ready'), false);
});

test('hidden page and disabled layer suspend traffic, retaining only the in-memory key', t => {
  const env = setup(); t.after(() => env.controller.destroy()); env.controller.connect('test-key');
  env.hide(true);
  assert.equal(env.layers.length, 0);
  assert.equal(env.scheduled.size, 0);
  assert.equal(env.statuses.at(-1).state, 'paused');
  assert.equal(env.controller.connected, true);
  env.hide(false); assert.equal(env.layers.length, 1);
  env.controller.setVisible(false);
  assert.equal(env.layers.length, 0);
  env.hide(true); env.hide(false); assert.equal(env.layers.length, 0);
  env.controller.setVisible(true); assert.equal(env.layers.length, 1);
  env.controller.disconnect();
  assert.equal(env.controller.connected, false);
  assert.equal(env.layers.length, 0);
  assert.equal(env.statuses.at(-1).state, 'disconnected');
});

test('request timeout aborts transport and cannot show a later successful response', async t => {
  const waiting = deferred();
  const env = setup({ fetch: () => waiting.promise });
  t.after(() => env.controller.destroy()); env.controller.connect('test-key');
  const pending = env.provider().requestImage(0, 0, 0);
  env.timers.run(15_000);
  assert.equal(env.requests[0][1].signal.aborted, true);
  assert.equal(env.statuses.at(-1).state, 'error');
  assert.equal(env.layers.length, 0);
  waiting.resolve(response()); await pending;
  assert.equal(env.statuses.some(state => state.state === 'ready'), false);
});

test('invalid vector data fails closed, without fabricated traffic or raw errors', async t => {
  const env = setup({ decode: () => { throw new Error('transport contained private-key'); } });
  t.after(() => env.controller.destroy()); env.controller.connect('private-key');
  await env.provider().requestImage(0, 0, 0);
  assert.equal(env.statuses.at(-1).state, 'error');
  assert.equal(JSON.stringify(env.statuses).includes('private-key'), false);
  assert.equal(env.layers.length, 0);
});

test('destroy aborts pending traffic and removes timers/listeners; later controls cannot reconnect', async () => {
  const waiting = deferred();
  const env = setup({ fetch: () => waiting.promise }); env.controller.connect('test-key');
  const pending = env.provider().requestImage(0, 0, 0);
  env.controller.destroy();
  assert.equal(env.requests[0][1].signal.aborted, true);
  assert.equal(env.layers.length, 0);
  assert.equal(env.scheduled.size, 0);
  assert.equal(env.controller.connected, false);
  const before = env.statuses.length;
  env.hide(true); env.hide(false); env.controller.refresh(); env.controller.setVisible(true);
  assert.equal(env.controller.connect('another-key'), false);
  assert.equal(env.statuses.length, before);
  assert.equal(env.layers.length, 0);
  waiting.resolve(response()); await pending;
  assert.equal(env.statuses.length, before);
});

test('server-managed connection requests the same-origin relay and holds no key in the page', async t => {
  const env = setup(); t.after(() => env.controller.destroy());
  assert.equal(env.controller.connectViaServer(), true);
  assert.equal(env.controller.connected, true);
  assert.equal(env.statuses.at(-1).managed, true);
  await env.provider().requestImage(18, 11, 5);
  const [url, options] = env.requests[0];
  assert.equal(url, './api/civil/traffic/flow/5/18/11');
  assert.equal(options.mode, 'same-origin');
  assert.equal('TomTom-Api-Key' in options.headers, false);
  assert.equal(env.statuses.at(-1).state, 'ready');
  env.controller.disconnect();
  assert.equal(env.controller.connected, false);
  assert.equal(env.statuses.at(-1).managed, false);
  env.controller.connect('test-key');
  await env.provider().requestImage(0, 0, 0);
  assert.equal(env.requests[1][0].startsWith('https://api.tomtom.com/'), true);
  assert.equal(env.statuses.at(-1).managed, false);
});

test('a rejected server key points to .env instead of the in-page dialog', async t => {
  const env = setup({ fetch: async () => response(403) }); t.after(() => env.controller.destroy());
  env.controller.connectViaServer();
  await env.provider().requestImage(0, 0, 0);
  assert.equal(env.statuses.at(-1).state, 'error');
  assert.match(env.statuses.at(-1).message, /\.env/);
  assert.equal(env.scheduled.size, 0);
});

test('decoded tiles are offered to other layers, whose errors do not stop traffic', async t => {
  const received = [];
  const env = setup({ onTile: event => { received.push(event); throw new Error('consumer failed'); } });
  t.after(() => env.controller.destroy());
  const errors = t.mock.method(console, 'error', () => {});
  env.controller.connect('test-key');
  await env.provider().requestImage(18, 11, 5);
  assert.deepEqual(received.map(({ x, y, zoom }) => [x, y, zoom]), [[18, 11, 5]]);
  assert.equal(received[0].tile.layers[0].name, 'Traffic flow');
  assert.equal(env.statuses.at(-1).state, 'ready');
  assert.equal(errors.mock.callCount(), 1);
});
