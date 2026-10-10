/** Adaptor de date în memorie: scenariu fictiv de demonstrație sau, după `startLive()`, mesajele serverului C2. */
export const SENSOR_TYPES = Object.freeze({
  radar: { label: 'Radar', color: '#62a9ff' },
  acoustic: { label: 'Acustic', color: '#bd95ff' },
  rf: { label: 'RF', color: '#f1bf69' },
  eoir: { label: 'EO/IR', color: '#63d9b4' },
  other: { label: 'Alt senzor', color: '#c0cbd9' },
});

export const ENTITY_TYPES = Object.freeze({
  uas: { label: 'UAS', short: 'UAS', color: '#82b9ff' },
  person: { label: 'Persoană', short: 'P', color: '#f0c77d' },
  ugv: { label: 'UGV', short: 'UGV', color: '#bc9af5' },
  usv: { label: 'USV', short: 'USV', color: '#7ad9c8' },
  unknown: { label: 'Necunoscut', short: '?', color: '#c0cbd9' },
});

export const STATUS_LABELS = Object.freeze({
  new: 'Nouă',
  review: 'În verificare',
  confirmed: 'Confirmată',
  closed: 'Închisă',
});

const INITIAL_SNAPSHOT = {
  sensors: [
    {
      id: 'SEN-01', name: 'Radar Nord', type: 'radar', vendor: 'Furnizor A · demo',
      status: 'online', x: 560, y: 200, lastSeen: '2026-10-09T15:12:00+03:00',
      description: 'Senzor radar de demonstrație; furnizează observații de poziție.',
    },
    {
      id: 'SEN-02', name: 'Acustic Vest', type: 'acoustic', vendor: 'Furnizor B · demo',
      status: 'online', x: 180, y: 405, lastSeen: '2026-10-09T15:11:00+03:00',
      description: 'Senzor acustic de demonstrație; raportează semnale pentru verificare.',
    },
    {
      id: 'SEN-03', name: 'RF Central', type: 'rf', vendor: 'Furnizor C · demo',
      status: 'online', x: 615, y: 440, lastSeen: '2026-10-09T15:12:00+03:00',
      description: 'Senzor RF de demonstrație; observațiile necesită evaluare umană.',
    },
    {
      id: 'SEN-04', name: 'EO/IR Sud', type: 'eoir', vendor: 'Furnizor D · demo',
      status: 'online', x: 610, y: 650, lastSeen: '2026-10-09T15:12:00+03:00',
      description: 'Senzor optic și infraroșu de demonstrație; sursă pentru clasificare vizuală.',
    },
    {
      id: 'SEN-05', name: 'Radar Est', type: 'radar', vendor: 'Furnizor E · demo',
      status: 'online', x: 1000, y: 370, lastSeen: '2026-10-09T15:11:00+03:00',
      description: 'Al doilea furnizor radar, prezentat prin același format de date.',
    },
    {
      id: 'SEN-06', name: 'EO/IR Vest', type: 'eoir', vendor: 'Furnizor D · demo',
      status: 'offline', x: 300, y: 630, lastSeen: '2026-10-09T15:01:00+03:00',
      description: 'Senzor indisponibil în acest scenariu; ora indică ultima observație de stare.',
    },
  ],
  observations: [
    {
      id: 'OBS-024', name: 'Observație aeriană 024', type: 'uas', status: 'new',
      x: 655, y: 278, confidence: 92,
      firstSeen: '2026-10-09T15:08:00+03:00', lastSeen: '2026-10-09T15:12:00+03:00',
      sensorIds: ['SEN-01', 'SEN-03'], zone: 'Sector Nord',
      description: 'Clasificare UAS propusă pe baza a două surse simulate. Necesită verificarea operatorului.',
    },
    {
      id: 'OBS-023', name: 'Observație persoană 023', type: 'person', status: 'review',
      x: 410, y: 560, confidence: 87,
      firstSeen: '2026-10-09T15:06:00+03:00', lastSeen: '2026-10-09T15:11:00+03:00',
      sensorIds: ['SEN-02', 'SEN-04'], zone: 'Acces Vest',
      description: 'Prezență estimată a unei persoane în zona de acces. Clasificarea nu stabilește identitatea sau caracterul unei intruziuni.',
    },
    {
      id: 'OBS-022', name: 'Observație terestră 022', type: 'ugv', status: 'confirmed',
      x: 755, y: 565, confidence: 95,
      firstSeen: '2026-10-09T15:04:00+03:00', lastSeen: '2026-10-09T15:12:00+03:00',
      sensorIds: ['SEN-03', 'SEN-04'], zone: 'Sector Sud',
      description: 'Clasificare UGV confirmată în scenariul demonstrativ. Confirmarea se referă exclusiv la evaluarea observației.',
    },
    {
      id: 'OBS-021', name: 'Observație de suprafață 021', type: 'usv', status: 'review',
      x: 1030, y: 520, confidence: 78,
      firstSeen: '2026-10-09T15:03:00+03:00', lastSeen: '2026-10-09T15:11:00+03:00',
      sensorIds: ['SEN-05'], zone: 'Sector Est · apă',
      description: 'Posibil vehicul de suprafață pe apă, raportat de o singură sursă simulată.',
    },
    {
      id: 'OBS-020', name: 'Observație neclasificată 020', type: 'unknown', status: 'new',
      x: 320, y: 270, confidence: 46,
      firstSeen: '2026-10-09T15:09:00+03:00', lastSeen: '2026-10-09T15:10:00+03:00',
      sensorIds: ['SEN-02'], zone: 'Sector Nord-Vest',
      description: 'Semnal cu încredere redusă. Sunt necesare informații suplimentare pentru clasificare.',
    },
  ],
  events: [
    {
      id: 'EVT-005', time: '2026-10-09T15:12:00+03:00', kind: 'info', observationId: 'OBS-024',
      title: 'Observație actualizată', description: 'OBS-024 · două surse simulate disponibile pentru verificare.',
    },
    {
      id: 'EVT-004', time: '2026-10-09T15:10:00+03:00', kind: 'warning', observationId: 'OBS-020',
      title: 'Clasificare incertă', description: 'OBS-020 · încredere estimată 46%; evaluarea rămâne deschisă.',
    },
    {
      id: 'EVT-003', time: '2026-10-09T15:08:00+03:00', kind: 'info', observationId: 'OBS-024',
      title: 'Observație nouă', description: 'OBS-024 · clasificare aeriană propusă în Sector Nord.',
    },
    {
      id: 'EVT-002', time: '2026-10-09T15:07:00+03:00', kind: 'success', observationId: 'OBS-022',
      title: 'Evaluare confirmată', description: 'OBS-022 · clasificare terestră confirmată de operatorul demonstrativ.',
    },
    {
      id: 'EVT-001', time: '2026-10-09T15:02:00+03:00', kind: 'warning',
      title: 'Senzor indisponibil', description: 'EO/IR Vest · ultima stare primită la 15:01, în scenariul demonstrativ.',
    },
  ],
};

const copy = (value) => JSON.parse(JSON.stringify(value));
let snapshot = copy(INITIAL_SNAPSHOT);
let sequence = INITIAL_SNAPSHOT.events.length;
let live = false;
const liveSensors = new Map(), liveThreats = new Set();

const SENSOR_ALIASES = { radar: 'radar', camera: 'eoir', eo: 'eoir', ir: 'eoir', eoir: 'eoir', 'eo/ir': 'eoir', optical: 'eoir', rf: 'rf', acoustic: 'acoustic', audio: 'acoustic' };
const coordinates = (latitude, longitude) => `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? 'S' : 'N'} · ${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? 'V' : 'E'}`;
function addEvent(event) {
  sequence += 1;
  snapshot.events.unshift({ id: `EVT-${String(sequence).padStart(3, '0')}`, ...event });
}

export const isLive = () => live;

/** Înlocuiește scenariul fictiv cu o stare goală, completată numai de mesajele serverului C2. */
export function startLive() {
  if (live) return;
  live = true; resetLive();
}

/** Golește starea live, de exemplu când puntea locală a repornit și numerotează mesajele de la început. */
export function resetLive() {
  if (!live) return;
  snapshot = { sensors: [], observations: [], events: [] }; sequence = 0;
  liveSensors.clear(); liveThreats.clear();
}

/**
 * Adaugă o amenințare primită de la server (mesajul Threat + `seq` și `receivedAt` de la puntea locală).
 * Mesajul nu are identificator, oră sau poziția țintei: ID-ul și ora sunt ale punții, poziția este a senzorului.
 * → { id, sensor } sau null pentru un mesaj deja primit.
 */
export function ingestThreat(threat) {
  if (!live || liveThreats.has(threat.seq)) return null;
  liveThreats.add(threat.seq);
  const key = `${threat.sensor_type}|${threat.latitude_sensor.toFixed(5)}|${threat.longitude_sensor.toFixed(5)}`;
  let sensor = liveSensors.get(key);
  if (!sensor) {
    const type = SENSOR_ALIASES[threat.sensor_type.toLowerCase()] || 'other';
    sensor = {
      id: `SNS-${String(liveSensors.size + 1).padStart(2, '0')}`, name: `${type === 'other' ? threat.sensor_type || SENSOR_TYPES.other.label : SENSOR_TYPES[type].label} ${liveSensors.size + 1}`, type, vendor: 'Server C2',
      status: 'online', lastSeen: threat.receivedAt, live: true, sensorType: threat.sensor_type,
      position: { latitude: threat.latitude_sensor, longitude: threat.longitude_sensor },
      description: 'Senzor raportat de serverul C2 într-un mesaj de amenințare. Starea „online” înseamnă doar că a raportat o detecție.',
    };
    liveSensors.set(key, sensor); snapshot.sensors.push(sensor);
  }
  sensor.lastSeen = threat.receivedAt;
  const id = `THR-${String(threat.seq).padStart(3, '0')}`;
  snapshot.observations.unshift({
    id, name: `Amenințare ${threat.seq}`, type: threat.drone_type ? 'uas' : 'unknown', status: 'new', confidence: null,
    firstSeen: threat.receivedAt, lastSeen: threat.receivedAt, sensorIds: [sensor.id],
    zone: coordinates(threat.latitude_sensor, threat.longitude_sensor), description: '',
    live: true, seq: threat.seq, threatType: threat.threat_type, droneType: threat.drone_type, sensorType: threat.sensor_type,
    position: { ...sensor.position }, interceptors: [...threat.top_interceptors], launches: [],
  });
  addEvent({
    time: threat.receivedAt, kind: 'warning', observationId: id, title: 'Amenințare nouă',
    description: `${id} · ${threat.threat_type}${threat.drone_type ? ` · ${threat.drone_type}` : ''} · detectată de ${sensor.name}.`,
  });
  return { id, sensor: copy(sensor) };
}

/** Consemnează o comandă de lansare deja trimisă serverului; nu confirmă executarea ei. */
export function recordLaunch(id, interceptor, sentAt) {
  const observation = snapshot.observations.find((item) => item.id === id);
  if (!observation?.live) return;
  observation.launches.unshift({ interceptor, sentAt });
  addEvent({
    time: sentAt, kind: 'success', observationId: id, title: 'Comandă de lansare trimisă',
    description: `${id} · interceptor ${interceptor}. Trimisă serverului C2; executarea nu este confirmată de interfață.`,
  });
}

/** Returnează o copie, pentru ca interfața să nu poată modifica direct starea adaptorului. */
export async function getSnapshot() {
  return copy(snapshot);
}

/** Modifică numai evaluarea unei observații fictive; nu reprezintă autorizare reală. */
export async function updateObservation(id, status, { role, reason = '' } = {}) {
  if (role !== 'operator') {
    throw new Error(live ? 'Doar rolul Operator poate modifica evaluarea.' : 'Doar rolul demonstrativ Operator poate modifica evaluarea.');
  }
  if (!['review', 'confirmed', 'closed'].includes(status)) {
    throw new Error('Stare invalidă pentru evaluarea observației.');
  }
  const observation = snapshot.observations.find((item) => item.id === id);
  if (!observation) throw new Error('Observația nu a fost găsită.');
  const cleanedReason = typeof reason === 'string' ? reason.trim() : '';
  if (status === 'closed' && !cleanedReason) {
    throw new Error('Introdu un motiv pentru închiderea observației.');
  }
  if (cleanedReason.length > 1000) {
    throw new Error('Motivul poate conține cel mult 1.000 de caractere.');
  }
  if (observation.status === status) return copy(observation);

  const previousStatus = observation.status;
  observation.status = status;
  // Scenariul fictiv are un ceas simulat; în modul live se folosește ora reală.
  const elapsedSeconds = sequence + 1 - INITIAL_SNAPSHOT.events.length;
  const eventTime = live ? new Date().toISOString() : new Date(Date.parse('2026-10-09T15:12:00+03:00') + elapsedSeconds * 1000).toISOString();
  addEvent({
    time: eventTime,
    title: `Evaluare: ${STATUS_LABELS[status].toLocaleLowerCase('ro-RO')}`,
    description: `${id} · ${STATUS_LABELS[previousStatus]} → ${STATUS_LABELS[status]}. ${live ? 'Evaluare locală a operatorului.' : 'Operator demonstrativ.'}${cleanedReason ? ` Motiv: ${cleanedReason}` : ''}`,
    kind: status === 'confirmed' || status === 'closed' ? 'success' : 'info',
    observationId: id,
  });
  return copy(observation);
}

export async function resetDemo() {
  live = false; liveSensors.clear(); liveThreats.clear();
  snapshot = copy(INITIAL_SNAPSHOT);
  sequence = INITIAL_SNAPSHOT.events.length;
  return getSnapshot();
}
