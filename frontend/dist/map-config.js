/** Configurație exclusiv cartografică. Toate resursele implicite sunt servite local. */
export const defaultMapConfig = Object.freeze({
  name: 'Natural Earth · local',
  url: './vendor/cesium/Assets/Textures/NaturalEarthII/{z}/{x}/{y}.jpg',
  scheme: 'tms',
  projection: 'EPSG:4326',
  minimumLevel: 0,
  maximumLevel: 2,
  credit: 'Natural Earth · date cartografice de rezoluție mică',
  // Pentru un set regional, furnizați [vest, sud, est, nord] în grade WGS84.
  bounds: null,
  initialView: [5, 32, 40, 57],
});

export function normalizeMapConfig(input, baseUrl) {
  const config = { ...defaultMapConfig, ...input };
  if (typeof config.url !== 'string' || !config.url.trim()) throw new Error('Introdu URL-ul tile-urilor.');
  if (!['xyz', 'tms'].includes(config.scheme)) throw new Error('Schema trebuie să fie XYZ sau TMS.');
  if (!['EPSG:3857', 'EPSG:4326'].includes(config.projection)) throw new Error('Proiecția nu este acceptată.');
  for (const key of ['minimumLevel', 'maximumLevel']) {
    if (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 24) throw new Error('Nivelurile trebuie să fie numere întregi între 0 și 24.');
  }
  if (config.minimumLevel > config.maximumLevel) throw new Error('Nivelul minim depășește nivelul maxim.');
  const resolved = new URL(config.url, baseUrl);
  if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('Tile-urile trebuie servite prin HTTP(S), inclusiv pe localhost.');
  if (resolved.username || resolved.password) throw new Error('URL-ul nu poate conține credențiale.');
  if (resolved.search || resolved.hash) throw new Error('Folosește o cale locală de tile-uri, fără parametri sau fragment.');
  // Deployment-ul poate publica /tiles/ printr-un reverse proxy către serverul LAN.
  if (resolved.origin !== new URL(baseUrl).origin) throw new Error('Folosește o sursă de pe aceeași origine, de exemplu /tiles/{z}/{x}/{y}.png.');
  if (!config.url.includes('{z}') || !config.url.includes('{x}') || (!config.url.includes('{y}') && !config.url.includes('{reverseY}'))) throw new Error('URL-ul trebuie să conțină {z}, {x} și {y}.');
  if (config.scheme === 'xyz' && config.url.includes('{reverseY}')) throw new Error('Pentru XYZ folosește {y}; {reverseY} se folosește cu TMS.');
  if (config.bounds !== null) {
    if (!Array.isArray(config.bounds) || config.bounds.length !== 4 || !config.bounds.every(Number.isFinite)) throw new Error('Limitele trebuie să aibă forma [vest, sud, est, nord].');
    const [west, south, east, north] = config.bounds;
    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) throw new Error('Limitele geografice nu sunt valide.');
  }
  // Un nivel minim mare pe tot globul ar declanșa prea multe cereri inițiale.
  if (config.minimumLevel > 0 && config.bounds === null) throw new Error('Un set care începe peste nivelul 0 necesită limite geografice explicite.');
  config.url = config.scheme === 'tms' ? config.url.replace('{y}', '{reverseY}') : config.url;
  config.name = String(config.name || 'Tile-uri locale').slice(0, 100);
  config.credit = String(config.credit || 'Sursă cartografică locală').slice(0, 240);
  return config;
}
