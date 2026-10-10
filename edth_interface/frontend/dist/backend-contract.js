// JSON contract between the C2 server and this interface (see INTEGRATION.md). The messages carry no
// type field, so each one is recognised by its keys. Used by the local bridge and by the page.

const MAX_TEXT = 200;
const MAX_INTERCEPTORS = 10;
export const MAX_MESSAGE_BYTES = 64 * 1024;

const text = value => typeof value === 'string' && value.length <= MAX_TEXT ? value.trim() : null;
const latitude = value => typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
const longitude = value => typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;

/**
 * → { kind: 'threat' | 'map_point' | 'login_response', value } with only the contract fields, or null.
 * A message with a wrong type or an out-of-range coordinate is rejected whole, never partly shown.
 */
export function classifyMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if ('threat_type' in message) {
    const value = {
      threat_type: text(message.threat_type), sensor_type: text(message.sensor_type), drone_type: text(message.drone_type),
      latitude_sensor: message.latitude_sensor, longitude_sensor: message.longitude_sensor,
      top_interceptors: Array.isArray(message.top_interceptors) && message.top_interceptors.length <= MAX_INTERCEPTORS ? message.top_interceptors.map(text) : null,
    };
    if (!value.threat_type || value.sensor_type === null || value.drone_type === null || !latitude(value.latitude_sensor) || !longitude(value.longitude_sensor)
      || !value.top_interceptors || value.top_interceptors.some(item => !item)) return null;
    return { kind: 'threat', value };
  }
  if ('accepted' in message) return typeof message.accepted === 'boolean' ? { kind: 'login_response', value: { accepted: message.accepted } } : null;
  if ('latitude' in message || 'longitude' in message) {
    return latitude(message.latitude) && longitude(message.longitude) ? { kind: 'map_point', value: { latitude: message.latitude, longitude: message.longitude } } : null;
  }
  return null;
}

/** Login request as the server reads it; null when a field is missing or unreasonable. */
export function loginRequest(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const name = username.trim();
  if (!name || name.length > MAX_TEXT || !password || password.length > 1024) return null;
  return { username: name, password };
}

/** Launch command as the server reads it. `launch` must be an explicit boolean chosen by the operator. */
export function launchCommand(interceptorName, launch) {
  const name = text(interceptorName);
  if (!name || typeof launch !== 'boolean') return null;
  return { launch, interceptor_name: name };
}

/**
 * Splits a TCP byte stream into top-level JSON objects. The server has no framing yet, so objects
 * may arrive concatenated, newline-separated or cut across packets; bytes between objects are skipped.
 */
export function createJsonSplitter({ maxBytes = MAX_MESSAGE_BYTES } = {}) {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let buffer = '', depth = 0, inString = false, escaped = false, scanned = 0, start = -1;
  function reset() { depth = 0; inString = false; escaped = false; start = -1; }
  return {
    /** → { messages: object[], rejected: number } for this chunk. */
    push(chunk) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const messages = [];
      let rejected = 0;
      for (; scanned < buffer.length; scanned++) {
        const character = buffer[scanned];
        if (start < 0) { if (character === '{') { start = scanned; depth = 1; } continue; }
        if (inString) {
          if (escaped) escaped = false;
          else if (character === '\\') escaped = true;
          else if (character === '"') inString = false;
        } else if (character === '"') inString = true;
        else if (character === '{') depth++;
        else if (character === '}' && --depth === 0) {
          try { messages.push(JSON.parse(buffer.slice(start, scanned + 1))); } catch { rejected++; }
          start = -1;
        }
      }
      if (start < 0) { buffer = ''; scanned = 0; }
      else if (buffer.length - start > maxBytes) { rejected++; buffer = ''; scanned = 0; reset(); }
      else if (start > 0) { buffer = buffer.slice(start); scanned -= start; start = 0; }
      return { messages, rejected };
    },
  };
}
