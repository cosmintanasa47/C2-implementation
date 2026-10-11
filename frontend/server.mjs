import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createTrafficRelay } from './server-traffic.mjs';
import { createAuthBridge } from './server-auth.mjs';
import { handlePresentation } from './server-presentation.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
// Optional local settings: the environment first, then .env here or in the parent project folder.
// Both files are outside dist/ and are never served or published.
function localSetting(name) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  for (const file of ['./.env', '../.env']) {
    try {
      const value = parseEnv(readFileSync(new URL(file, import.meta.url), 'utf8'))[name]?.trim();
      if (value) return value;
    } catch { /* missing or unreadable file: try the next one */ }
  }
  return undefined;
}
const trafficKey = localSetting('TOMTOM_API_KEY');
const trafficRelay = createTrafficRelay({ key: trafficKey });
// C2 server (TCP). Without BACKEND_PORT the interface stays on its demonstration data.
const backendHost = localSetting('BACKEND_HOST') || '127.0.0.1', backendPort = Number(localSetting('BACKEND_PORT') || 55067);
const backendBridge = createAuthBridge({ host: backendHost, port: backendPort });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.wasm': 'application/wasm', '.xml': 'application/xml', '.gif': 'image/gif' };
const httpServer = createServer(async (request, response) => {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(request.headers.host)) { response.writeHead(403).end("Forbidden"); return; }
  try {
    if (handlePresentation(request, response)) return;
    if (await backendBridge.handle(request, response)) return;
    if (await trafficRelay(request, response)) return;
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (target !== root && !target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}\nTrafic TomTom: ${trafficKey ? 'cheie configurată' : 'fără cheie (adaugă TOMTOM_API_KEY în .env și repornește)'}\nServer C2: ${backendPort ? `${backendHost}:${backendPort}` : 'neconfigurat (adaugă BACKEND_PORT în .env); date demonstrative'}`));

httpServer.requestTimeout=20000;
httpServer.headersTimeout=10000;
for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>{backendBridge.close();httpServer.close();});
