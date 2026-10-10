// Estimated activity of mapped venues. Every weight, hourly curve and threshold below is a modelling
// assumption of this application, not a measurement: the result ranks areas, it never counts people.

const wd = 'wd', fr = 'fr', sa = 'sa', su = 'su';
const closed = Object.freeze(new Array(24).fill(0));
function group(id, label, profiles) {
  for (const key of [wd, fr, sa, su]) if (profiles[key].length !== 24) throw new Error(`Invalid hourly profile ${id}.${key}`);
  return Object.freeze({ id, label, profiles: Object.freeze(profiles) });
}
function days(weekday, saturday = weekday, sunday = saturday, friday = weekday) {
  return { [wd]: weekday, [fr]: friday, [sa]: saturday, [su]: sunday };
}

// Share of each group's own weekly peak, per local hour 0–23. Order is the bit order of the cell file.
export const ACTIVITY_GROUPS = Object.freeze([
  group('food', 'Restaurante și cafenele', days(
    [0, 0, 0, 0, 0, 0, .05, .15, .3, .3, .3, .45, .8, .9, .6, .4, .35, .45, .65, .8, .75, .5, .25, .1],
    [.15, .05, 0, 0, 0, 0, .03, .1, .2, .3, .4, .55, .8, .9, .75, .55, .5, .55, .75, .95, 1, .8, .5, .25],
    [.15, .05, 0, 0, 0, 0, .03, .08, .2, .3, .4, .55, .8, .9, .75, .55, .45, .45, .55, .65, .6, .4, .2, .08],
    [.05, 0, 0, 0, 0, 0, .05, .15, .3, .3, .3, .45, .8, .9, .6, .4, .4, .5, .75, .95, 1, .8, .5, .25])),
  group('night', 'Baruri și cluburi', days(
    [.1, .05, 0, 0, 0, 0, 0, 0, 0, 0, 0, .02, .05, .05, .05, .05, .1, .15, .25, .4, .5, .5, .4, .25],
    [.95, .8, .6, .35, .15, .05, 0, 0, 0, 0, 0, .02, .05, .08, .08, .1, .15, .2, .35, .55, .75, .9, 1, 1],
    [.95, .8, .6, .35, .15, .05, 0, 0, 0, 0, 0, .02, .05, .08, .08, .1, .12, .15, .2, .3, .35, .3, .2, .1],
    [.1, .05, 0, 0, 0, 0, 0, 0, 0, 0, 0, .02, .05, .05, .05, .05, .1, .2, .35, .55, .75, .9, 1, 1])),
  group('shop', 'Magazine și piețe', days(
    [0, 0, 0, 0, 0, 0, .02, .1, .25, .4, .5, .55, .6, .6, .55, .55, .65, .8, .85, .75, .5, .25, .05, 0],
    [0, 0, 0, 0, 0, 0, .02, .08, .25, .5, .75, .95, 1, .95, .85, .8, .8, .8, .75, .6, .4, .2, .05, 0],
    [0, 0, 0, 0, 0, 0, 0, .03, .12, .3, .5, .65, .7, .65, .6, .55, .5, .45, .35, .25, .15, .05, 0, 0])),
  group('edu', 'Școli și universități', days(
    [0, 0, 0, 0, 0, 0, .02, .3, .95, 1, 1, 1, .95, .8, .6, .45, .3, .2, .12, .06, .02, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, .03, .05, .05, .05, .05, .03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    closed)),
  group('work', 'Instituții și servicii', days(
    [0, 0, 0, 0, 0, 0, .02, .15, .6, .95, 1, 1, .9, .9, .9, .8, .55, .25, .1, .03, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, .05, .1, .1, .1, .1, .05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    closed)),
  group('health', 'Spitale și farmacii', days(
    [.2, .2, .2, .2, .2, .2, .25, .45, .8, 1, 1, .95, .85, .8, .75, .7, .6, .5, .4, .3, .25, .2, .2, .2],
    [.2, .2, .2, .2, .2, .2, .2, .3, .45, .55, .55, .5, .45, .4, .35, .35, .3, .3, .3, .25, .25, .2, .2, .2],
    [.2, .2, .2, .2, .2, .2, .2, .22, .28, .32, .32, .3, .3, .28, .25, .25, .25, .25, .25, .22, .2, .2, .2, .2])),
  group('transit', 'Gări și stații', days(
    [.03, .01, .01, .01, .03, .15, .5, .9, 1, .7, .5, .45, .5, .55, .6, .7, .9, 1, .9, .6, .4, .25, .15, .08],
    [.05, .02, .01, .01, .02, .08, .2, .3, .45, .55, .6, .6, .6, .6, .6, .55, .55, .55, .5, .4, .3, .25, .15, .1],
    [.05, .02, .01, .01, .02, .05, .12, .2, .3, .4, .45, .5, .5, .5, .5, .5, .5, .5, .45, .35, .25, .2, .12, .06])),
  group('leisure', 'Sport, cultură și agrement', days(
    [0, 0, 0, 0, 0, 0, .03, .08, .12, .2, .25, .3, .3, .3, .3, .35, .45, .6, .7, .65, .45, .25, .08, .02],
    [.02, 0, 0, 0, 0, 0, .03, .08, .2, .4, .6, .75, .8, .8, .85, .95, 1, 1, .9, .75, .55, .3, .12, .05],
    [.02, 0, 0, 0, 0, 0, .03, .08, .2, .4, .6, .8, .85, .85, .9, 1, 1, .95, .8, .6, .4, .2, .08, .02])),
  group('lodging', 'Hoteluri și pensiuni', days(
    [.15, .12, .1, .1, .1, .12, .3, .6, .7, .5, .3, .2, .2, .2, .25, .3, .35, .45, .55, .6, .55, .45, .3, .2])),
  group('worship', 'Lăcașuri de cult', days(
    [0, 0, 0, 0, 0, 0, .05, .15, .15, .1, .05, .05, .05, .05, .05, .05, .1, .2, .2, .1, .02, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, .05, .15, .2, .15, .1, .05, .05, .05, .05, .05, .15, .3, .3, .15, .02, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, .05, .3, .7, 1, 1, .8, .4, .1, .05, .05, .1, .2, .2, .1, .02, 0, 0, 0])),
]);

export const CELL_LEVEL = 16;
const EARTH_KM = 40075.016686;
const DAY_TYPES = [su, wd, wd, wd, wd, fr, sa];
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Local Romanian weekday (0 = Sunday) and fractional hour. Public holidays are not modelled. */
export function bucharestClock(date) {
  const parts = Object.fromEntries(clockFormat.formatToParts(date).map(part => [part.type, part.value]));
  return { day: WEEKDAYS[parts.weekday], hour: Number(parts.hour) + Number(parts.minute) / 60 };
}

/** One factor per group; hourly values sit at the half hour and are interpolated across midnight. */
export function groupFactors(day, hour) {
  if (!Number.isInteger(day) || day < 0 || day > 6 || !(hour >= 0 && hour < 24)) throw new Error('Invalid local time.');
  const position = hour - 0.5, first = Math.floor(position), share = position - first;
  const at = (profiles, index) => profiles[DAY_TYPES[(day + Math.floor(index / 24) + 7) % 7]][(index + 24) % 24];
  return ACTIVITY_GROUPS.map(({ profiles }) => at(profiles, first) * (1 - share) + at(profiles, first + 1) * share);
}

// Display bands for activity-weighted density, in model points per km². Calibrated on the prepared
// Romanian cells so that city centres reach red only around their busiest modelled hours.
export const ACTIVITY_BANDS = Object.freeze({ yellow: 100, red: 400 });
export const ACTIVITY_COLORS = Object.freeze({ green: '#3ca66b', yellow: '#e1bb40', red: '#d95650' });
export function activityBand(density) {
  if (!Number.isFinite(density) || density < 0) return 'unknown';
  return density >= ACTIVITY_BANDS.red ? 'red' : density >= ACTIVITY_BANDS.yellow ? 'yellow' : 'green';
}

/** Area of one Web Mercator cell whose top edge is row `y` at `level`, in km². */
export function cellAreaKm2(level, y) {
  const count = 2 ** level;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / count)));
  return (EARTH_KM * Math.cos(latitude) / count) ** 2;
}

/** Sparse cells: u16 dx, u16 dy, u16 group mask, then one u16 (weight × valueScale) per set bit. */
export function decodeCells(buffer, manifest) {
  const groups = ACTIVITY_GROUPS.length;
  if (manifest?.schemaVersion !== 1 || manifest.level !== CELL_LEVEL || manifest.groups?.join() !== ACTIVITY_GROUPS.map(item => item.id).join()) throw new Error('Unsupported activity manifest.');
  const count = manifest.cellCount, view = new DataView(buffer);
  if (!Number.isInteger(count) || count < 0 || !(manifest.valueScale > 0)) throw new Error('Invalid activity manifest.');
  const x = new Int32Array(count), y = new Int32Array(count), weights = new Float32Array(count * groups);
  let offset = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 6 > view.byteLength) throw new Error('Truncated activity cells.');
    x[index] = manifest.originX + view.getUint16(offset, true);
    y[index] = manifest.originY + view.getUint16(offset + 2, true);
    const mask = view.getUint16(offset + 4, true); offset += 6;
    if (mask === 0 || mask >= 2 ** groups) throw new Error('Invalid activity cell.');
    for (let bit = 0; bit < groups; bit++) {
      if (!(mask & (1 << bit))) continue;
      if (offset + 2 > view.byteLength) throw new Error('Truncated activity cells.');
      weights[index * groups + bit] = view.getUint16(offset, true) / manifest.valueScale; offset += 2;
    }
  }
  if (offset !== view.byteLength) throw new Error('Unexpected activity cell bytes.');
  return { count, x, y, weights };
}

/** Modelled points of every cell for one set of group factors. */
export function cellActivity(cells, factors) {
  const groups = ACTIVITY_GROUPS.length, activity = new Float32Array(cells.count);
  for (let index = 0; index < cells.count; index++) {
    let sum = 0;
    for (let bit = 0; bit < groups; bit++) sum += cells.weights[index * groups + bit] * factors[bit];
    activity[index] = sum;
  }
  return activity;
}

export const cellKey = (level, x, y) => y * 2 ** level + x;

/**
 * Density per display cell at `level`. Coarser cells use the activity-weighted mean of their fine
 * cells (Σ a·d / Σ a), so a city keeps its intensity when zoomed out instead of being diluted by fields.
 */
export function densityAtLevel(cells, activity, level) {
  if (!Number.isInteger(level) || level < 0 || level > CELL_LEVEL) throw new Error('Invalid activity level.');
  const shift = CELL_LEVEL - level, weighted = new Map(), total = new Map();
  for (let index = 0; index < cells.count; index++) {
    const value = activity[index];
    const key = cellKey(level, cells.x[index] >> shift, cells.y[index] >> shift);
    // Cells with venues that are all closed stay in the map as measured-by-model zero, not as "no data".
    weighted.set(key, (weighted.get(key) || 0) + value * value / cellAreaKm2(CELL_LEVEL, cells.y[index]));
    total.set(key, (total.get(key) || 0) + value);
  }
  for (const [key, sum] of total) weighted.set(key, sum > 0 ? weighted.get(key) / sum : 0);
  return weighted;
}

// Live road congestion may raise the modelled value; free-flowing roads never lower it.
export const TRAFFIC_BOOST = 1;
export const TRAFFIC_MIN_LEVEL = 12; // coarser road averages say nothing about one neighbourhood
const TRAFFIC_SUBDIVISION = 2; // a traffic tile is split into at most 4 × 4 cells
const MIN_ROAD_UNITS = 0.5; // measured road length per cell, in cell widths

/**
 * Length-weighted slowdown (1 − relative speed) of a decoded TomTom flow tile, per cell no finer than
 * CELL_LEVEL. A tile finer than one cell reports that cell from its own part of the roads only.
 */
export function trafficCongestion(tile, x, y, zoom) {
  if (![x, y, zoom].every(Number.isInteger) || zoom < 0) return [];
  const subdivision = Math.max(0, Math.min(TRAFFIC_SUBDIVISION, CELL_LEVEL - zoom)), side = 2 ** subdivision;
  const length = new Float64Array(side * side), slow = new Float64Array(side * side);
  for (const layer of Array.isArray(tile?.layers) ? tile.layers : []) {
    if (layer.name !== 'Traffic flow' || !(layer.extent > 0) || !Array.isArray(layer.features)) continue;
    for (const feature of layer.features) {
      const speed = feature.properties?.relative_speed;
      if (feature.type !== 'LineString' || feature.properties?.road_closure === true || typeof speed !== 'number' || !(speed >= 0 && speed <= 1)) continue;
      for (const line of Array.isArray(feature.geometry) ? feature.geometry : []) {
        if (!Array.isArray(line)) continue;
        for (let index = 1; index < line.length; index++) {
          const a = line[index - 1], b = line[index];
          const middleX = (a.x + b.x) / 2 / layer.extent, middleY = (a.y + b.y) / 2 / layer.extent;
          if (!(middleX >= 0 && middleX < 1 && middleY >= 0 && middleY < 1)) continue;
          const cell = Math.floor(middleY * side) * side + Math.floor(middleX * side);
          const units = Math.hypot(b.x - a.x, b.y - a.y) / layer.extent;
          length[cell] += units; slow[cell] += units * (1 - speed);
        }
      }
    }
  }
  const level = Math.min(CELL_LEVEL, zoom + subdivision), shift = Math.max(0, zoom - CELL_LEVEL), result = [];
  for (let cell = 0; cell < side * side; cell++) {
    if (length[cell] < MIN_ROAD_UNITS / side) continue;
    result.push({ level, x: (x >> shift) * side + cell % side, y: (y >> shift) * side + Math.floor(cell / side), congestion: slow[cell] / length[cell] });
  }
  return result;
}

/** Display cells for one 512 px Web Mercator tile: about 32 px per cell, never finer than CELL_LEVEL. */
export function tileCells(x, y, zoom, tileSize = 512) {
  const level = Math.min(CELL_LEVEL, Math.max(zoom + 4, Math.min(12, zoom + 6)));
  const perTile = 2 ** (level - zoom), cellPixels = tileSize / perTile;
  // One extra cell on every side lets neighbouring tiles interpolate to the same edge values.
  const startX = Math.floor(x * perTile) - 1, startY = Math.floor(y * perTile) - 1, size = Math.ceil(perTile) + 2;
  return { level, startX, startY, size, cellPixels, offsetX: (startX - x * perTile) * cellPixels, offsetY: (startY - y * perTile) * cellPixels };
}

const BAND_RGBA = Object.freeze({ green: [60, 166, 107, 85], yellow: [225, 187, 64, 150], red: [217, 86, 80, 175] });

/** RGBA of `size` × `size` display cells; cells without mapped venues stay transparent. */
export function activityPixels({ level, startX, startY, size }, density, boost = () => 0) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const base = density.get(cellKey(level, startX + column, startY + row));
      if (base === undefined) continue;
      const band = activityBand(base * (1 + TRAFFIC_BOOST * boost(level, startX + column, startY + row)));
      if (band !== 'unknown') pixels.set(BAND_RGBA[band], (row * size + column) * 4);
    }
  }
  return pixels;
}
