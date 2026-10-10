// Local-only relay for TomTom traffic tiles. The API key stays in this process and is never sent to the browser.
const ENDPOINT = 'https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile';
const TILE_PATH = /^\/api\/civil\/traffic\/flow\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/;
const CONFIG_PATH = '/api/civil/config';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TILE_BYTES = 8 * 1024 * 1024;

export function validTrafficKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\s\x00-\x1f\x7f]/.test(value);
}

/** Returns an async handler: true when the request was answered, false when it is not an API path. */
export function createTrafficRelay({ key, fetch: fetchTile = (...args) => globalThis.fetch(...args) } = {}) {
  const apiKey = validTrafficKey(key?.trim()) ? key.trim() : null;
  const send = (response, status, headers = {}, body) => { response.writeHead(status, { 'Cache-Control': 'no-store', ...headers }).end(body); return true; };
  return async function handle(request, response) {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (!pathname.startsWith('/api/')) return false;
    if (request.method !== 'GET') return send(response, 405, { Allow: 'GET' });
    // Other sites open in the same browser must not be able to spend the quota.
    const site = request.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return send(response, 403);
    if (pathname === CONFIG_PATH) {
      return send(response, 200, { 'Content-Type': 'application/json' }, JSON.stringify({ traffic: { provider: 'tomtom', configured: Boolean(apiKey) } }));
    }
    const match = TILE_PATH.exec(pathname);
    if (!match) return send(response, 404);
    const [zoom, x, y] = match.slice(1).map(Number);
    if (zoom > 22 || x >= 2 ** zoom || y >= 2 ** zoom) return send(response, 400);
    if (!apiKey) return send(response, 503);
    try {
      const upstream = await fetchTile(`${ENDPOINT}/${zoom}/${x}/${y}?apiVersion=2`, {
        headers: { 'TomTom-Api-Key': apiKey, Accept: 'application/vnd.mapbox-vector-tile' },
        redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // Status only: an upstream error body is never relayed.
      if (!upstream.ok) return send(response, [401, 403, 429].includes(upstream.status) ? upstream.status : 502);
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.byteLength > MAX_TILE_BYTES) return send(response, 502);
      return send(response, 200, { 'Content-Type': 'application/vnd.mapbox-vector-tile' }, body);
    } catch {
      // Never log or forward transport errors: they may include credentials.
      return send(response, 502);
    }
  };
}
