// Bridge between the C2 server (plain TCP, JSON objects) and the page (same-origin HTTP + Server-Sent Events).
// A browser cannot open a TCP socket, so this process holds the single connection and the login session.
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { classifyMessage, createJsonSplitter, launchCommand, loginRequest } from './dist/backend-contract.js';

const RETRY_MS = 2_000;
const LOGIN_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 20_000;
const KEEP_THREATS = 200;
const KEEP_POINTS = 300;
const MAX_BODY_BYTES = 4_096;

export function validBackendPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

/** `handle(request, response)` answers /api/backend/* and returns true; any other path returns false. */
export function createBackendBridge({ host = '127.0.0.1', port, connect = options => net.createConnection(options), now = () => Date.now(), timers = globalThis, log = console } = {}) {
  const configured = validBackendPort(port) !== null;
  const clients = new Set(), threats = [], points = [];
  let socket = null, connected = false, authenticated = false, username = null, closed = false;
  let retryTimer, ignored = 0, pendingLogin = null, splitter = createJsonSplitter();
  // `seq` numbers each kind of message since this bridge started; `session` tells a page that they restarted.
  const session = randomUUID(), counters = { threat: 0, map_point: 0 };

  const status = () => ({ configured, connected, authenticated, username, ignored, session });
  function send(client, event, data) { client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  function broadcast(event, data) { for (const client of clients) send(client, event, data); }
  function keep(list, item, limit) { list.push(item); if (list.length > limit) list.shift(); }
  function settleLogin(result) {
    if (!pendingLogin) return;
    const { resolve, timer } = pendingLogin; pendingLogin = null;
    timers.clearTimeout(timer); resolve(result);
  }
  function receive(chunk) {
    const { messages, rejected } = splitter.push(chunk);
    const ignoredBefore = ignored;
    ignored += rejected;
    for (const message of messages) {
      const result = classifyMessage(message);
      if (!result) { ignored++; continue; }
      if (result.kind === 'login_response') { settleLogin({ accepted: result.value.accepted }); continue; }
      const item = { seq: ++counters[result.kind], receivedAt: new Date(now()).toISOString(), ...result.value };
      if (result.kind === 'threat') keep(threats, item, KEEP_THREATS); else keep(points, item, KEEP_POINTS);
      broadcast(result.kind, item);
    }
    if (ignored !== ignoredBefore) broadcast('status', status());
  }
  function dropped() {
    if (closed) return;
    const wasConnected = connected;
    connected = false; authenticated = false; username = null; socket = null;
    settleLogin({ error: 'disconnected' });
    if (wasConnected) { log.info('Server C2: conexiune închisă; reîncerc.'); broadcast('status', status()); }
    timers.clearTimeout(retryTimer);
    retryTimer = timers.setTimeout(open, RETRY_MS);
  }
  function open() {
    if (closed || !configured) return;
    splitter = createJsonSplitter();
    const current = connect({ host, port: validBackendPort(port) });
    socket = current;
    current.on('connect', () => { if (socket !== current) return; connected = true; log.info(`Server C2: conectat la ${host}:${port}.`); broadcast('status', status()); });
    current.on('data', chunk => { if (socket === current) receive(chunk); });
    // 'close' always follows 'error'; the error text may name hosts but never credentials.
    current.on('error', () => {});
    current.on('close', () => { if (socket === current) dropped(); });
  }
  function answer(response, code, body, headers = {}) {
    response.writeHead(code, { 'Cache-Control': 'no-store', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers });
    response.end(body === undefined ? undefined : JSON.stringify(body));
    return true;
  }
  async function readJson(request) {
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return null;
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
  }
  async function login(request, response) {
    if (!/^application\/json\b/i.test(request.headers['content-type'] || '')) return answer(response, 415);
    const body = await readJson(request);
    const message = loginRequest(body?.username, body?.password);
    if (!message) return answer(response, 400, { error: 'invalid' });
    if (!connected || !socket) return answer(response, 503, { error: 'disconnected' });
    if (pendingLogin) return answer(response, 409, { error: 'pending' });
    const result = await new Promise(resolve => {
      pendingLogin = { resolve, timer: timers.setTimeout(() => settleLogin({ error: 'timeout' }), LOGIN_TIMEOUT_MS) };
      // Credentials go only to the C2 server: never to logs, events or retained state.
      socket.write(`${JSON.stringify(message)}\n`);
    });
    if (result.error) return answer(response, result.error === 'timeout' ? 504 : 503, { error: result.error });
    authenticated = result.accepted; username = result.accepted ? message.username : null;
    broadcast('status', status());
    return answer(response, 200, { accepted: result.accepted });
  }
  // Forwards one operator decision. Never repeated, queued or sent on reconnect: if it cannot be
  // written now, the operator is told and decides again.
  async function launch(request, response) {
    if (!/^application\/json\b/i.test(request.headers['content-type'] || '')) return answer(response, 415);
    const body = await readJson(request);
    const command = launchCommand(body?.interceptor_name, body?.launch);
    if (!command) return answer(response, 400, { error: 'invalid' });
    if (!connected || !socket) return answer(response, 503, { error: 'disconnected' });
    if (!authenticated) return answer(response, 403, { error: 'unauthenticated' });
    // Only an interceptor the server itself proposed for that threat can be named.
    const threat = threats.find(item => item.seq === body.threat_seq);
    if (!threat || !threat.top_interceptors.includes(command.interceptor_name)) return answer(response, 422, { error: 'not_offered' });
    socket.write(`${JSON.stringify(command)}\n`);
    log.info(`Server C2: comandă de lansare trimisă de ${username} (launch=${command.launch}).`);
    return answer(response, 202, { sent: true, sentAt: new Date(now()).toISOString() });
  }
  function events(request, response) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    send(response, 'status', status());
    // A reloaded page receives what the bridge still remembers; `seq` lets it skip what it already has.
    for (const item of threats) send(response, 'threat', item);
    for (const item of points) send(response, 'map_point', item);
    clients.add(response);
    const heartbeat = timers.setInterval(() => response.write(': keep-alive\n\n'), HEARTBEAT_MS);
    request.on('close', () => { timers.clearInterval(heartbeat); clients.delete(response); });
    return true;
  }
  open();
  return {
    status,
    async handle(request, response) {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (!pathname.startsWith('/api/backend/')) return false;
      // Other sites open in the same browser must not read the feed or try passwords.
      const site = request.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') return answer(response, 403);
      if (pathname === '/api/backend/status' && request.method === 'GET') return answer(response, 200, status());
      if (!configured) return answer(response, 404);
      if (pathname === '/api/backend/events' && request.method === 'GET') return events(request, response);
      if (pathname === '/api/backend/login' && request.method === 'POST') return login(request, response);
      if (pathname === '/api/backend/launch' && request.method === 'POST') return launch(request, response);
      return answer(response, 404);
    },
    close() {
      closed = true;
      timers.clearTimeout(retryTimer); settleLogin({ error: 'disconnected' });
      for (const client of clients) client.end();
      clients.clear(); socket?.destroy(); socket = null; connected = false;
    },
  };
}
