import { createCivilOverlays, serverTrafficConfigured } from './civil-overlays.js';

const $ = id => document.getElementById(id);
const DAY_NAMES = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const clockText = hour => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(hour % 1 * 60)).padStart(2, '0')}`;

/** "Straturi locale" menu of the monitor map: optional traffic and estimated activity on the same Cesium globe. */
export function setupMonitorOverlays(viewer) {
  let traffic = false, activity = false, keyChecked = false, keyMissing = false;
  let trafficStatus = { state: 'disconnected' }, activityStatus = { state: 'paused' };
  const overlays = createCivilOverlays(window.Cesium, viewer, {
    onTrafficStatus: status => { trafficStatus = status; render(); },
    onActivityStatus: status => { activityStatus = status; render(); },
  });

  function render() {
    const trafficOn = traffic && trafficStatus.state === 'ready', activityOn = activity && activityStatus.state === 'ready';
    $('overlay-traffic').setAttribute('aria-pressed', String(traffic));
    $('overlay-activity').setAttribute('aria-pressed', String(activity));
    const trafficText = !traffic ? 'TomTom · actualizare la 60 s'
      : keyMissing ? 'Lipsește TOMTOM_API_KEY în .env; repornește serverul după ce o adaugi'
      : trafficStatus.state === 'ready' ? 'TomTom · live'
      : trafficStatus.state === 'error' ? trafficStatus.message
      : trafficStatus.state === 'paused' ? 'În pauză cât pagina este ascunsă' : 'Se încarcă…';
    $('overlay-traffic-status').textContent = trafficText;
    $('overlay-traffic-status').classList.toggle('layer-error', traffic && (keyMissing || trafficStatus.state === 'error'));
    const { state, live, day, hour, message, traffic: withTraffic } = activityStatus;
    const ready = activity && state === 'ready' && Number.isInteger(day);
    $('overlay-activity-status').textContent = !activity ? 'Model orar · locuri OSM'
      : state === 'error' ? message
      : !ready ? 'Se încarcă locurile cartate…'
      : `${DAY_NAMES[day]}, ${clockText(hour)} · ${!live ? 'previzualizare' : withTraffic ? 'acum, cu trafic live' : 'acum'}`;
    $('overlay-activity-status').classList.toggle('layer-error', activity && state === 'error');
    $('overlay-activity-options').hidden = !activity;
    $('overlay-day').disabled = $('overlay-hour').disabled = !ready;
    $('overlay-now').hidden = !ready || live;
    if (ready) {
      const shown = live ? hour : Math.floor(hour * 2) / 2;
      $('overlay-day').value = String(day);
      $('overlay-hour').value = String(Math.floor(hour * 2) / 2);
      $('overlay-hour-output').textContent = clockText(shown);
    }
    $('overlay-legend').hidden = !traffic && !activity;
    const count = Number(trafficOn) + Number(activityOn);
    $('overlay-count').hidden = count === 0;
    $('overlay-count').textContent = String(count);
  }
  function open(value) {
    $('layer-menu').hidden = !value;
    $('source-button').setAttribute('aria-expanded', String(value));
  }
  async function toggleTraffic() {
    traffic = !traffic;
    if (!traffic) { overlays.traffic.setVisible(false); render(); return; }
    render();
    if (!keyChecked) {
      // The key stays on the local server; the page only learns whether one exists.
      keyMissing = !await serverTrafficConfigured();
      keyChecked = !keyMissing;
    }
    if (!traffic) return;
    if (keyMissing) { render(); return; }
    if (overlays.traffic.connected) overlays.traffic.setVisible(true); else overlays.traffic.connectViaServer();
    render();
  }
  const preview = () => overlays.activity.setTime({ day: Number($('overlay-day').value), hour: Number($('overlay-hour').value) });
  const outside = event => { if (!$('layer-menu').hidden && !event.target.closest('.source-control')) open(false); };
  const escape = event => { if (event.key === 'Escape' && !$('layer-menu').hidden) { open(false); $('source-button').focus(); } };

  $('source-button').addEventListener('click', () => open($('layer-menu').hidden));
  $('layer-menu-close').addEventListener('click', () => open(false));
  $('overlay-traffic').addEventListener('click', () => void toggleTraffic());
  $('overlay-activity').addEventListener('click', () => { activity = !activity; overlays.activity.setVisible(activity); render(); });
  $('overlay-day').addEventListener('change', preview);
  $('overlay-hour').addEventListener('input', preview);
  $('overlay-now').addEventListener('click', () => overlays.activity.setTime(null));
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  render();
  return {
    raise: () => overlays.raise(),
    close: () => open(false),
    destroy() {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      overlays.destroy();
    },
  };
}
