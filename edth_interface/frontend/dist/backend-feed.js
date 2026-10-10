import { classifyMessage } from './backend-contract.js';

const JSON_POST = { method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
const ERRORS = {
  disconnected: 'Serverul C2 nu este conectat.', timeout: 'Serverul C2 nu a răspuns la timp.', pending: 'O autentificare este deja în curs.',
  invalid: 'Datele introduse nu sunt valide.', unauthenticated: 'Autentifică-te înainte de a trimite comenzi.',
  not_offered: 'Interceptorul nu se află printre cele propuse de server pentru această amenințare.',
};
async function post(fetchJson, path, body) {
  let response;
  try { response = await fetchJson(path, { ...JSON_POST, body: JSON.stringify(body) }); } catch { throw new Error('Serverul local nu răspunde.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(ERRORS[data.error] || 'Cererea nu a putut fi trimisă.');
  return data;
}

/**
 * Live feed from the C2 server through the local bridge. Without a configured bridge (or on static
 * hosting) `onStatus({ configured: false })` is reported once and the page keeps its demonstration data.
 */
export async function connectBackendFeed({ onStatus = () => {}, onThreat = () => {}, onPoint = () => {}, fetch: fetchJson = (...args) => globalThis.fetch(...args), EventSource: Source = globalThis.EventSource } = {}) {
  let source = null;
  const offline = { configured: false, connected: false, authenticated: false, username: null };
  let configured = false;
  try {
    const response = await fetchJson('./api/backend/status', { mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    configured = response.ok && (await response.json())?.configured === true;
  } catch { configured = false; }
  if (!configured) onStatus(offline);
  else {
    source = new Source('./api/backend/events');
    const parse = handler => event => { try { handler(JSON.parse(event.data)); } catch { /* malformed frame: ignored */ } };
    source.addEventListener('status', parse(status => onStatus({ ...offline, ...status, configured: true })));
    const forward = (kind, handler) => parse(item => {
      // The bridge validated the message; the page checks the contract again before showing anything.
      const result = classifyMessage(item);
      if (result?.kind === kind && Number.isInteger(item.seq) && typeof item.receivedAt === 'string') handler({ seq: item.seq, receivedAt: item.receivedAt, ...result.value });
    });
    source.addEventListener('threat', forward('threat', onThreat));
    source.addEventListener('map_point', forward('map_point', onPoint));
    // EventSource reconnects by itself; until then nothing may look connected.
    source.onerror = () => onStatus({ ...offline, configured: true });
  }
  return {
    configured,
    /** → true when the server accepted the credentials. They are not kept by the page. */
    async login(username, password) { return (await post(fetchJson, './api/backend/login', { username, password })).accepted === true; },
    /** Sends one launch decision for an interceptor the server proposed for that threat. */
    async launch(threatSeq, interceptorName) { return post(fetchJson, './api/backend/launch', { threat_seq: threatSeq, interceptor_name: interceptorName, launch: true }); },
    close() { source?.close(); source = null; },
  };
}
