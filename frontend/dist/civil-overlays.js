import { createCivilTraffic } from './civil-traffic.js';
import { createCivilActivity } from './civil-activity.js';

/** Road traffic drawn above the activity shading, sharing the measured road tiles. Used by both map pages. */
export function createCivilOverlays(Cesium, viewer, { onTrafficStatus = () => {}, onActivityStatus = () => {} } = {}) {
  let activity;
  const traffic = createCivilTraffic(Cesium, viewer, {
    onTile: tile => activity?.ingestTraffic(tile),
    onStatus: status => {
      // Only roads measured by a running traffic layer may raise the estimate.
      if (status.state !== 'ready' && status.state !== 'loading') activity?.clearTraffic();
      onTrafficStatus(status);
    },
  });
  // Road lines stay readable above the shaded activity cells.
  activity = createCivilActivity(Cesium, viewer, { onStatus: onActivityStatus, onLayer: () => traffic.raise() });
  return {
    traffic, activity,
    /** Call after the base map changes: a new base layer is added above existing overlays. */
    raise() { activity.raise(); traffic.raise(); },
    destroy() { traffic.destroy(); activity.destroy(); },
  };
}

/** True when the local server holds a TomTom key; static hosting has no such endpoint. */
export async function serverTrafficConfigured(fetchConfig = (...args) => globalThis.fetch(...args)) {
  try {
    const response = await fetchConfig('./api/civil/config', { mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    return response.ok && (await response.json())?.traffic?.configured === true;
  } catch { return false; }
}
