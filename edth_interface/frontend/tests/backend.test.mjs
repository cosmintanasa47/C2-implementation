import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { classifyMessage, createJsonSplitter, launchCommand, loginRequest } from '../dist/backend-contract.js';
import { createBackendBridge, validBackendPort } from '../server-backend.mjs';
import { ingestThreat, getSnapshot, isLive, recordLaunch, resetDemo, resetLive, startLive, updateObservation } from '../dist/data.js';
import { connectBackendFeed } from '../dist/backend-feed.js';

const THREAT = { threat_type: 'UAS', latitude_sensor: 44.5711, longitude_sensor: 26.085, sensor_type: 'radar', drone_type: 'FPV', top_interceptors: ['A1', 'B2', 'C3'] };

test('messages are recognised by their keys and rejected whole when a field is wrong', () => {
  assert.deepEqual(classifyMessage({ ...THREAT, extra: 'dropped' }), { kind: 'threat', value: THREAT });
  assert.deepEqual(classifyMessage({ latitude: 44.4, longitude: 26.1, altitude: 9 }), { kind: 'map_point', value: { latitude: 44.4, longitude: 26.1 } });
  assert.deepEqual(classifyMessage({ accepted: true }), { kind: 'login_response', value: { accepted: true } });
  assert.deepEqual(classifyMessage({ ...THREAT, drone_type: '', top_interceptors: [] }).value.top_interceptors, []);
  for (const invalid of [
    null, [], 'x', {}, { accepted: 'true' }, { latitude: 44.4 }, { latitude: 91, longitude: 26 }, { latitude: '44', longitude: 26 }, { latitude: NaN, longitude: 26 },
    { ...THREAT, threat_type: '' }, { ...THREAT, latitude_sensor: 120 }, { ...THREAT, longitude_sensor: null }, { ...THREAT, sensor_type: 7 },
    { ...THREAT, top_interceptors: 'A1' }, { ...THREAT, top_interceptors: ['A1', 3] }, { ...THREAT, top_interceptors: Array(11).fill('A') }, { ...THREAT, drone_type: 'x'.repeat(201) },
  ]) assert.equal(classifyMessage(invalid), null, JSON.stringify(invalid));
});

test('login and launch requests carry exactly the contract fields', () => {
  assert.deepEqual(loginRequest(' ana ', ' p w '), { username: 'ana', password: ' p w ' });
  for (const [username, password] of [['', 'x'], ['ana', ''], [undefined, 'x'], ['ana', 5], ['a'.repeat(201), 'x']]) assert.equal(loginRequest(username, password), null);
  assert.deepEqual(launchCommand('A1', true), { launch: true, interceptor_name: 'A1' });
  assert.deepEqual(launchCommand('A1', false), { launch: false, interceptor_name: 'A1' });
  for (const [name, launch] of [['A1', 'true'], ['A1', 1], ['A1', undefined], ['', true], [null, true]]) assert.equal(launchCommand(name, launch), null);
});

test('the byte stream is split into objects whether they are concatenated, separated or cut across packets', () => {
  const splitter = createJsonSplitter();
  const tricky = { a: 1, note: 'brace } quote " and backslash \\ inside' };
  const text = `${JSON.stringify(tricky)}${JSON.stringify({ b: { c: [1, 2] } })}\n\r\n {"d":"é"}`;
  const bytes = new TextEncoder().encode(text), received = [];
  for (let offset = 0; offset < bytes.length; offset += 7) received.push(...splitter.push(bytes.subarray(offset, offset + 7)).messages);
  assert.deepEqual(received, [tricky, { b: { c: [1, 2] } }, { d: 'é' }]);
  assert.deepEqual(splitter.push('junk{"e":1}xx{bad json}{"f":2}'), { messages: [{ e: 1 }, { f: 2 }], rejected: 1 });
  const small = createJsonSplitter({ maxBytes: 20 });
  assert.equal(small.push(`{"big":"${'x'.repeat(40)}`).rejected, 1);
  assert.deepEqual(small.push('"}{"ok":true}').messages, [{ ok: true }], 'The stream recovers after an oversized object.');
});

function bridgeSetup({ port = 5050 } = {}) {
  let nextTimer = 0, time = Date.parse('2026-10-10T11:00:00Z');
  const scheduled = new Map(), sockets = [], logs = [];
  const timers = {
    setTimeout(fn, delay) { const id = ++nextTimer; scheduled.set(id, { fn, delay }); return id; }, clearTimeout(id) { scheduled.delete(id); },
    setInterval() { return ++nextTimer; }, clearInterval() {},
    run(delay) { for (const [id, item] of [...scheduled]) if (item.delay === delay) { scheduled.delete(id); item.fn(); } },
  };
  const connect = options => { const socket = new EventEmitter(); socket.options = options; socket.written = []; socket.write = data => socket.written.push(data); socket.destroy = () => {}; sockets.push(socket); return socket; };
  const bridge = createBackendBridge({ host: '10.0.0.5', port, connect, timers, now: () => (time += 1000), log: { info: line => logs.push(line) } });
  function call(url, { method = 'GET', headers = {}, body } = {}) {
    const request = new EventEmitter(); Object.assign(request, { url, method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } });
    request[Symbol.asyncIterator] = async function* () { if (body !== undefined) yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); };
    const result = { status: undefined, headers: undefined, chunks: [], ended: false, request };
    const response = { writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders; }, write(chunk) { result.chunks.push(chunk); }, end(chunk) { if (chunk !== undefined) result.chunks.push(chunk); result.ended = true; } };
    return { result, done: bridge.handle(request, response).then(handled => ({ handled, ...result, json: result.chunks.length && result.ended ? JSON.parse(result.chunks.join('')) : undefined })) };
  }
  const online = () => { sockets.at(-1).emit('connect'); return sockets.at(-1); };
  const frames = result => result.chunks.join('').split('\n\n').filter(frame => frame.startsWith('event:')).map(frame => { const [event, data] = frame.split('\n'); return [event.slice(7), JSON.parse(data.slice(6))]; });
  return { bridge, call, sockets, logs, timers, scheduled, online, frames };
}

test('without a port the bridge is off and never opens a connection', async () => {
  for (const port of [undefined, '', 'abc', 0, 70000]) assert.equal(validBackendPort(port), null);
  assert.equal(validBackendPort('5050'), 5050);
  const env = bridgeSetup({ port: null });
  assert.equal(env.sockets.length, 0);
  assert.equal((await env.call('/api/backend/status').done).json.configured, false);
  assert.equal((await env.call('/api/backend/events').done).status, 404);
  assert.equal((await env.call('/civil-data/activity.json').done).handled, false);
});

test('threats and points are numbered, kept for reloaded pages and pushed to open ones', async t => {
  const env = bridgeSetup(); t.after(() => env.bridge.close());
  assert.deepEqual(env.sockets[0].options, { host: '10.0.0.5', port: 5050 });
  const socket = env.online();
  const live = env.call('/api/backend/events').result;
  assert.equal(live.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  socket.emit('data', Buffer.from(`${JSON.stringify(THREAT)}${JSON.stringify({ latitude: 44.5, longitude: 26.2 })}{"unknown":1}${JSON.stringify({ ...THREAT, latitude_sensor: 500 })}`));
  const received = env.frames(live);
  assert.deepEqual(received.map(([event]) => event), ['status', 'threat', 'map_point', 'status']);
  assert.deepEqual(received[1][1], { seq: 1, receivedAt: '2026-10-10T11:00:01.000Z', ...THREAT });
  assert.equal(received[2][1].seq, 1, 'Points have their own numbering.');
  assert.equal(received[3][1].ignored, 2, 'Unknown and invalid messages are counted, never shown.');
  const replay = env.frames(env.call('/api/backend/events').result);
  assert.deepEqual(replay.map(([event]) => event), ['status', 'threat', 'map_point']);
  assert.equal(replay[0][1].session, received[0][1].session);
  assert.equal((await env.call('/api/backend/events', { headers: { 'sec-fetch-site': 'cross-site' } }).done).status, 403);
});

test('login is forwarded once, answered by the server, and never logged', async t => {
  const env = bridgeSetup(); t.after(() => env.bridge.close());
  assert.equal((await env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'secret-pass' } }).done).status, 503);
  const socket = env.online();
  assert.equal((await env.call('/api/backend/login', { method: 'POST', body: { username: 'ana' } }).done).status, 400);
  assert.equal((await env.call('/api/backend/login', { method: 'POST', body: 'username=ana', headers: { 'content-type': 'text/plain' } }).done).status, 415);
  const pending = env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'secret-pass' } }).done;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(socket.written, ['{"username":"ana","password":"secret-pass"}\n']);
  assert.equal((await env.call('/api/backend/login', { method: 'POST', body: { username: 'bob', password: 'x' } }).done).status, 409);
  socket.emit('data', Buffer.from('{"accepted":true}'));
  assert.deepEqual((await pending).json, { accepted: true });
  assert.deepEqual([env.bridge.status().authenticated, env.bridge.status().username], [true, 'ana']);
  assert.equal(JSON.stringify([env.logs, env.bridge.status()]).includes('secret-pass'), false);
  // A refused login and a silent server leave the session unauthenticated.
  const refused = env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'bad' } }).done;
  await new Promise(resolve => setImmediate(resolve)); socket.emit('data', Buffer.from('{"accepted":false}'));
  assert.deepEqual((await refused).json, { accepted: false });
  assert.equal(env.bridge.status().authenticated, false);
  const silent = env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'x' } }).done;
  await new Promise(resolve => setImmediate(resolve)); env.timers.run(5000);
  assert.equal((await silent).status, 504);
});

test('a launch needs an accepted login and an interceptor the server proposed, and is written exactly once', async t => {
  const env = bridgeSetup(); t.after(() => env.bridge.close());
  const socket = env.online();
  socket.emit('data', Buffer.from(JSON.stringify(THREAT)));
  const launch = body => env.call('/api/backend/launch', { method: 'POST', body }).done;
  assert.equal((await launch({ threat_seq: 1, interceptor_name: 'A1', launch: true })).status, 403);
  const login = env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'p' } }).done;
  await new Promise(resolve => setImmediate(resolve)); socket.emit('data', Buffer.from('{"accepted":true}')); await login;
  socket.written.length = 0;
  assert.equal((await launch({ threat_seq: 1, interceptor_name: 'Z9', launch: true })).status, 422);
  assert.equal((await launch({ threat_seq: 7, interceptor_name: 'A1', launch: true })).status, 422);
  assert.equal((await launch({ threat_seq: 1, interceptor_name: 'A1', launch: 'true' })).status, 400);
  assert.equal((await launch({ threat_seq: 1, interceptor_name: 'A1' })).status, 400);
  assert.deepEqual(socket.written, []);
  const sent = await launch({ threat_seq: 1, interceptor_name: 'B2', launch: true });
  assert.equal(sent.status, 202);
  assert.equal(sent.json.sent, true);
  assert.deepEqual(socket.written, ['{"launch":true,"interceptor_name":"B2"}\n']);
});

test('a dropped connection ends the session, is retried, and sends nothing on its own', async t => {
  const env = bridgeSetup(); t.after(() => env.bridge.close());
  const first = env.online();
  first.emit('data', Buffer.from(JSON.stringify(THREAT)));
  const login = env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'p' } }).done;
  await new Promise(resolve => setImmediate(resolve)); first.emit('data', Buffer.from('{"accepted":true}')); await login;
  const waiting = env.call('/api/backend/login', { method: 'POST', body: { username: 'ana', password: 'p' } }).done;
  await new Promise(resolve => setImmediate(resolve));
  first.emit('error', new Error('reset')); first.emit('close');
  assert.equal((await waiting).status, 503);
  assert.deepEqual([env.bridge.status().connected, env.bridge.status().authenticated, env.bridge.status().username], [false, false, null]);
  assert.equal((await env.call('/api/backend/launch', { method: 'POST', body: { threat_seq: 1, interceptor_name: 'A1', launch: true } }).done).status, 503);
  env.timers.run(2000);
  assert.equal(env.sockets.length, 2);
  const second = env.online();
  assert.deepEqual(second.written, [], 'Neither the login nor a command is replayed after reconnecting.');
  assert.equal(env.bridge.status().authenticated, false);
  first.emit('data', Buffer.from(JSON.stringify(THREAT)));
  assert.equal(env.frames(env.call('/api/backend/events').result).filter(([event]) => event === 'threat').length, 1, 'A replaced socket is ignored.');
});

test('live mode replaces the demonstration data with server threats and local decisions', async t => {
  t.after(() => resetDemo());
  assert.equal(isLive(), false);
  assert.equal(ingestThreat({ seq: 1, receivedAt: '2026-10-10T11:00:01.000Z', ...THREAT }), null, 'Nothing is ingested into the demonstration scenario.');
  startLive();
  assert.deepEqual(await getSnapshot(), { sensors: [], observations: [], events: [] });
  const added = ingestThreat({ seq: 1, receivedAt: '2026-10-10T11:00:01.000Z', ...THREAT });
  assert.equal(added.id, 'THR-001');
  assert.deepEqual(added.sensor.position, { latitude: 44.5711, longitude: 26.085 });
  assert.equal(ingestThreat({ seq: 1, receivedAt: '2026-10-10T11:00:01.000Z', ...THREAT }), null, 'A replayed message is not duplicated.');
  ingestThreat({ seq: 2, receivedAt: '2026-10-10T11:00:05.000Z', ...THREAT, drone_type: '', sensor_type: 'camera', latitude_sensor: 44.4 });
  ingestThreat({ seq: 3, receivedAt: '2026-10-10T11:00:09.000Z', ...THREAT, sensor_type: 'lidar', longitude_sensor: 26.3 });
  let snapshot = await getSnapshot();
  assert.deepEqual(snapshot.observations.map(item => [item.id, item.type, item.status, item.confidence]), [['THR-003', 'uas', 'new', null], ['THR-002', 'unknown', 'new', null], ['THR-001', 'uas', 'new', null]]);
  assert.deepEqual(snapshot.sensors.map(item => [item.id, item.name, item.type]), [['SNS-01', 'Radar 1', 'radar'], ['SNS-02', 'EO/IR 2', 'eoir'], ['SNS-03', 'lidar 3', 'other']]);
  assert.deepEqual(snapshot.observations[2].interceptors, ['A1', 'B2', 'C3']);
  assert.equal(snapshot.events[0].title, 'Amenințare nouă');
  recordLaunch('THR-001', 'B2', '2026-10-10T11:01:00.000Z');
  await updateObservation('THR-001', 'review', { role: 'operator' });
  snapshot = await getSnapshot();
  assert.deepEqual(snapshot.observations[2].launches, [{ interceptor: 'B2', sentAt: '2026-10-10T11:01:00.000Z' }]);
  assert.equal(snapshot.observations[2].status, 'review');
  assert.match(snapshot.events[1].description, /executarea nu este confirmată/);
  assert.match(snapshot.events[0].description, /Evaluare locală a operatorului/);
  resetLive();
  assert.deepEqual(await getSnapshot(), { sensors: [], observations: [], events: [] });
  assert.equal(ingestThreat({ seq: 1, receivedAt: '2026-10-10T12:00:00.000Z', ...THREAT }).id, 'THR-001', 'After a bridge restart numbering starts again.');
});

test('the page feed stays on demonstration data without a bridge and re-checks every message', async () => {
  const statuses = [];
  const none = await connectBackendFeed({ onStatus: status => statuses.push(status), fetch: async () => ({ ok: false }), EventSource: class { constructor() { assert.fail('no stream without a bridge'); } } });
  assert.equal(none.configured, false);
  assert.deepEqual(statuses, [{ configured: false, connected: false, authenticated: false, username: null }]);
  let source; const threats = [], points = [], requests = [];
  class FakeSource { constructor(url) { this.url = url; this.listeners = {}; source = this; } addEventListener(name, fn) { this.listeners[name] = fn; } close() { this.closed = true; } }
  const fetch = async (url, options) => { requests.push([url, options]); return url.endsWith('/status') ? { ok: true, json: async () => ({ configured: true }) } : url.endsWith('/login') ? { ok: true, json: async () => ({ accepted: true }) } : { ok: false, json: async () => ({ error: 'unauthenticated' }) }; };
  const feed = await connectBackendFeed({ onStatus: status => statuses.push(status), onThreat: item => threats.push(item), onPoint: item => points.push(item), fetch, EventSource: FakeSource });
  assert.equal(source.url, './api/backend/events');
  const emit = (name, data) => source.listeners[name]({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  emit('threat', { seq: 4, receivedAt: '2026-10-10T11:00:01.000Z', ...THREAT, injected: '<img>' });
  emit('threat', { seq: 5, receivedAt: '2026-10-10T11:00:02.000Z', ...THREAT, latitude_sensor: 'x' });
  emit('threat', { receivedAt: '2026-10-10T11:00:02.000Z', ...THREAT });
  emit('map_point', { seq: 9, receivedAt: '2026-10-10T11:00:03.000Z', latitude: 44.4, longitude: 26.1 });
  emit('map_point', 'not json');
  assert.deepEqual(threats, [{ seq: 4, receivedAt: '2026-10-10T11:00:01.000Z', ...THREAT }]);
  assert.deepEqual(points, [{ seq: 9, receivedAt: '2026-10-10T11:00:03.000Z', latitude: 44.4, longitude: 26.1 }]);
  emit('status', { configured: true, connected: true, authenticated: false, username: null, session: 's1' });
  assert.equal(statuses.at(-1).connected, true);
  source.onerror();
  assert.deepEqual([statuses.at(-1).configured, statuses.at(-1).connected], [true, false]);
  assert.equal(await feed.login('ana', 'p'), true);
  assert.deepEqual(JSON.parse(requests.at(-1)[1].body), { username: 'ana', password: 'p' });
  await assert.rejects(feed.launch(4, 'A1'), /Autentifică-te/);
  assert.deepEqual(JSON.parse(requests.at(-1)[1].body), { threat_seq: 4, interceptor_name: 'A1', launch: true });
  feed.close(); assert.equal(source.closed, true);
});
