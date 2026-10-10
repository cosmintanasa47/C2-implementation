import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficRelay, validTrafficKey } from '../server-traffic.mjs';

function call(relay, url, { method = 'GET', headers = {} } = {}) {
  const result = { status: undefined, headers: undefined, body: undefined };
  const response = { writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders; return this; }, end(body) { result.body = body; } };
  return relay({ url, method, headers }, response).then(handled => ({ handled, ...result }));
}
const upstream = (status = 200, bytes = 3) => ({ ok: status === 200, status, arrayBuffer: async () => new ArrayBuffer(bytes) });

test('paths outside /api/ are left to the static file server', async () => {
  const relay = createTrafficRelay({ key: 'server-key', fetch: async () => assert.fail('no upstream call') });
  assert.equal((await call(relay, '/civil.html')).handled, false);
  assert.equal((await call(relay, '/')).handled, false);
});

test('configuration reports only whether a key exists, never its value', async () => {
  for (const [key, configured] of [['server-key', true], [' server-key \n', true], ['', false], [undefined, false], ['two words', false]]) {
    const result = await call(createTrafficRelay({ key }), '/api/civil/config');
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), { traffic: { provider: 'tomtom', configured } });
    assert.equal(String(result.body).includes('server-key'), false);
  }
  assert.equal(validTrafficKey('a'.repeat(513)), false);
});

test('a tile request is relayed with the key in a header and only the tile is returned', async () => {
  const requests = [];
  const relay = createTrafficRelay({ key: 'server-key', fetch: async (...args) => { requests.push(args); return upstream(); } });
  const result = await call(relay, '/api/civil/traffic/flow/5/18/11', { headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'application/vnd.mapbox-vector-tile');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.byteLength, 3);
  const [url, options] = requests[0];
  assert.equal(url, 'https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/5/18/11?apiVersion=2');
  assert.equal(options.headers['TomTom-Api-Key'], 'server-key');
  assert.equal(options.redirect, 'error');
  assert.equal(url.includes('server-key'), false);
});

test('invalid tiles, other methods, other sites and a missing key never reach TomTom', async () => {
  const fetch = async () => assert.fail('no upstream call');
  const relay = createTrafficRelay({ key: 'server-key', fetch });
  for (const path of ['/api/civil/traffic/flow/23/0/0', '/api/civil/traffic/flow/5/32/0', '/api/civil/traffic/flow/5/0/32']) assert.equal((await call(relay, path)).status, 400);
  for (const path of ['/api/civil/traffic/flow/5/-1/0', '/api/civil/traffic/flow/5/1.5/0', '/api/civil/traffic/flow/5/1/0/extra', '/api/other']) assert.equal((await call(relay, path)).status, 404);
  assert.equal((await call(relay, '/api/civil/traffic/flow/0/0/0', { method: 'POST' })).status, 405);
  for (const site of ['cross-site', 'same-site']) assert.equal((await call(relay, '/api/civil/traffic/flow/0/0/0', { headers: { 'sec-fetch-site': site } })).status, 403);
  assert.equal((await call(createTrafficRelay({ fetch }), '/api/civil/traffic/flow/0/0/0')).status, 503);
});

test('upstream failures return a status without a body or the key', async () => {
  for (const [status, expected] of [[401, 401], [403, 403], [429, 429], [500, 502], [596, 502]]) {
    const result = await call(createTrafficRelay({ key: 'server-key', fetch: async () => upstream(status) }), '/api/civil/traffic/flow/0/0/0');
    assert.equal(result.status, expected);
    assert.equal(result.body, undefined);
  }
  const failed = await call(createTrafficRelay({ key: 'server-key', fetch: async () => { throw new Error('transport contained server-key'); } }), '/api/civil/traffic/flow/0/0/0');
  assert.equal(failed.status, 502);
  assert.equal(failed.body, undefined);
  const oversized = await call(createTrafficRelay({ key: 'server-key', fetch: async () => upstream(200, 8 * 1024 * 1024 + 1) }), '/api/civil/traffic/flow/0/0/0');
  assert.equal(oversized.status, 502);
});
