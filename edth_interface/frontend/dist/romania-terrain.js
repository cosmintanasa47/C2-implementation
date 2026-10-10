/** Local, finite Romania terrain. No Cesium ion token or remote service is used.
 *
 * await createRomaniaTerrain(Cesium, { baseUrl: './maps/terrain/' }) returns a
 * TerrainProvider-compatible object, with sampleHeight(lon,lat) and
 * sampleHeights([{longitude,latitude}, ...]) helpers (coordinates in degrees).
 */
const TILE_SIZE = 256;
const MESH_SIZE = 257;
const MERCATOR_LIMIT = 85.0511287798066;

export function decodeTerrarium(red, green, blue) {
  return red * 256 + green + blue / 256 - 32768;
}

export function terrainPixelPosition(longitude, latitude, level) {
  const scale = TILE_SIZE * 2 ** level;
  const lat = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, latitude)) * Math.PI / 180;
  return {
    x: (longitude + 180) / 360 * scale - 0.5,
    y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * scale - 0.5,
  };
}

export function tileInRange(x, y, level, ranges) {
  const range = ranges[level];
  return Boolean(range && x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY);
}

export function terrainChildMask(x, y, level, maximumLevel, ranges) {
  if (level >= maximumLevel) return 0;
  // Cesium bit order: south-west, south-east, north-west, north-east.
  return [[0, 1, 1], [1, 1, 2], [0, 0, 4], [1, 0, 8]].reduce(
    (mask, [dx, dy, bit]) => mask | (tileInRange(x * 2 + dx, y * 2 + dy, level + 1, ranges) ? bit : 0), 0);
}

async function decodeTerrainPng(blob) {
  let image;
  let objectUrl;
  try {
    if (typeof createImageBitmap === 'function') {
      image = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } else {
      objectUrl = URL.createObjectURL(blob);
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Imagine de relief invalidă.'));
        img.src = objectUrl;
      });
    }
    if (image.width !== TILE_SIZE || image.height !== TILE_SIZE) throw new Error('Dimensiuni ale imaginii de relief invalide.');
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(TILE_SIZE, TILE_SIZE) : document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    const values = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < values.length; i++) values[i] = decodeTerrarium(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    return values;
  } finally {
    image?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function createQueue(limit) {
  let running = 0;
  const waiting = [];
  const advance = () => {
    while (running < limit && waiting.length) {
      const { run, resolve, reject } = waiting.shift();
      running++;
      Promise.resolve().then(run).then(resolve, reject).finally(() => { running--; advance(); });
    }
  };
  return run => new Promise((resolve, reject) => { waiting.push({ run, resolve, reject }); advance(); });
}

export async function createRomaniaTerrain(Cesium, {
  baseUrl = './maps/terrain/', cacheSize = 96, concurrency = 6,
  fetchImpl = globalThis.fetch.bind(globalThis), decodeImage = decodeTerrainPng,
} = {}) {
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const response = await fetchImpl(`${prefix}manifest.json`);
  if (!response.ok) throw new Error(`Pachetul local de relief nu este disponibil (${response.status}).`);
  const manifest = await response.json();
  if (!manifest.complete || manifest.format !== 'terrarium' || manifest.tileSize !== TILE_SIZE ||
      !Array.isArray(manifest.coverageTileRanges) || !Array.isArray(manifest.storedTileRanges)) {
    throw new Error('Manifestul pachetului local de relief este incomplet.');
  }
  const extension = manifest.imageFormat === 'webp' ? 'webp' : 'png';
  const maximumLevel = manifest.maximumLevel;
  if (!Number.isInteger(maximumLevel) || maximumLevel < 0 || maximumLevel > 19) throw new Error('Nivelul sursei de relief este invalid.');
  // Cesium stops refining a globe tile when all four children are upsampled.
  // Publish finite virtual meshes so local imagery can continue through z19,
  // while DEM downloads and elevation resolution remain capped at the source.
  const maximumRenderLevel = 19;
  const coverage = [...manifest.coverageTileRanges];
  for (let level = maximumLevel + 1; level <= maximumRenderLevel; level++) {
    const [west, south, east, north] = manifest.bounds;
    const nw = terrainPixelPosition(west, north, level);
    const se = terrainPixelPosition(east, south, level);
    const last = 2 ** level - 1;
    const index = value => Math.max(0, Math.min(last, Math.floor((value + 0.5) / TILE_SIZE)));
    coverage[level] = { minX: index(nw.x), maxX: index(se.x), minY: index(nw.y), maxY: index(se.y) };
  }
  const stored = manifest.storedTileRanges;
  const queue = createQueue(Math.max(1, Math.min(8, concurrency)));
  const cache = new Map();
  const failedTiles = new Set();
  const errorEvent = new Cesium.Event();
  const tilingScheme = new Cesium.WebMercatorTilingScheme();
  const levelZeroError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
    tilingScheme.ellipsoid, MESH_SIZE, tilingScheme.getNumberOfXTilesAtLevel(0));
  const zeroes = new Float32Array(TILE_SIZE * TILE_SIZE);

  const trimCache = () => {
    if (cache.size <= cacheSize) return;
    for (const [key, value] of cache) {
      if (cache.size <= cacheSize) break;
      if (value.settled) cache.delete(key);
    }
  };

  function loadTile(x, y, level) {
    const world = 2 ** level;
    x = Math.max(0, Math.min(world - 1, x));
    y = Math.max(0, Math.min(world - 1, y));
    if (!tileInRange(x, y, level, stored)) return Promise.resolve(zeroes);
    const key = `${level}/${x}/${y}`;
    if (failedTiles.has(key)) return Promise.resolve(zeroes);
    const previous = cache.get(key);
    if (previous) { cache.delete(key); cache.set(key, previous); return previous.promise; }
    const entry = { settled: false, promise: null };
    entry.promise = queue(async () => {
      try {
        const tileResponse = await fetchImpl(`${prefix}${key}.${extension}`);
        if (!tileResponse.ok) throw new Error(`HTTP ${tileResponse.status}`);
        const heights = await decodeImage(await tileResponse.blob());
        if (!(heights instanceof Float32Array) || heights.length !== TILE_SIZE * TILE_SIZE) throw new Error('Date de relief invalide.');
        return heights;
      } catch (error) {
        failedTiles.add(key);
        errorEvent.raiseEvent({ provider, message: `Relieful local ${key} nu a putut fi încărcat.`, x, y, level, error, retry: false });
        return zeroes;
      } finally {
        entry.settled = true;
        trimCache();
      }
    });
    cache.set(key, entry);
    trimCache();
    return entry.promise;
  }

  async function samplePixelPositions(positions, level) {
    const scale = TILE_SIZE * 2 ** level;
    const tiles = new Map();
    const clampPixel = value => Math.max(0, Math.min(scale - 1, value));
    for (const { x, y } of positions) {
      for (const py of [Math.floor(y), Math.floor(y) + 1]) {
        for (const px of [Math.floor(x), Math.floor(x) + 1]) {
          const tx = Math.floor(clampPixel(px) / TILE_SIZE), ty = Math.floor(clampPixel(py) / TILE_SIZE);
          const key = `${tx}/${ty}`;
          if (!tiles.has(key)) tiles.set(key, loadTile(tx, ty, level));
        }
      }
    }
    const resolved = new Map(await Promise.all([...tiles].map(async ([key, promise]) => [key, await promise])));
    const at = (px, py) => {
      px = clampPixel(px); py = clampPixel(py);
      const tx = Math.floor(px / TILE_SIZE), ty = Math.floor(py / TILE_SIZE);
      return resolved.get(`${tx}/${ty}`)[(py % TILE_SIZE) * TILE_SIZE + px % TILE_SIZE];
    };
    return positions.map(({ x, y }) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
        (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    });
  }

  function insideBounds(longitude, latitude) {
    const [west, south, east, north] = manifest.bounds;
    return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= west && longitude <= east && latitude >= south && latitude <= north;
  }

  const provider = {
    errorEvent, tilingScheme, hasWaterMask: false, hasVertexNormals: false,
    credit: new Cesium.Credit('Relief: Mapzen / Tilezen · Copernicus EU-DEM · USGS · NOAA'),
    manifest, sourceMaximumLevel: maximumLevel, maximumRenderLevel,
    getLevelMaximumGeometricError: level => levelZeroError / 2 ** level,
    getTileDataAvailable: (x, y, level) => level <= maximumRenderLevel && tileInRange(x, y, level, coverage),
    loadTileDataAvailability: () => undefined,
    async requestTileGeometry(x, y, level) {
      const present = level <= maximumRenderLevel && tileInRange(x, y, level, coverage);
      if (!present) return new Cesium.HeightmapTerrainData({ buffer: new Float32Array(4), width: 2, height: 2, childTileMask: 0 });
      const sourceLevel = Math.min(level, maximumLevel);
      const sourcePixelSpan = TILE_SIZE / 2 ** (level - sourceLevel);
      const intervals = Math.max(2, Math.ceil(sourcePixelSpan));
      const meshSize = intervals + 1;
      const originX = x * sourcePixelSpan - 0.5;
      const originY = y * sourcePixelSpan - 0.5;
      const worldPixels = TILE_SIZE * 2 ** sourceLevel;
      const clampPixel = value => Math.max(0, Math.min(worldPixels - 1, value));
      const minX = Math.floor(clampPixel(Math.floor(originX)) / TILE_SIZE);
      const maxX = Math.floor(clampPixel(Math.floor(originX + sourcePixelSpan) + 1) / TILE_SIZE);
      const minY = Math.floor(clampPixel(Math.floor(originY)) / TILE_SIZE);
      const maxY = Math.floor(clampPixel(Math.floor(originY + sourcePixelSpan) + 1) / TILE_SIZE);
      const neighbours = [];
      for (let sy = minY; sy <= maxY; sy++) for (let sx = minX; sx <= maxX; sx++) {
        neighbours.push(loadTile(sx, sy, sourceLevel));
      }
      const resolved = await Promise.all(neighbours);
      const neighbourColumns = maxX - minX + 1;
      const at = (px, py) => {
        px = clampPixel(px); py = clampPixel(py);
        const tileIndex = (Math.floor(py / TILE_SIZE) - minY) * neighbourColumns + Math.floor(px / TILE_SIZE) - minX;
        return resolved[tileIndex][(py % TILE_SIZE) * TILE_SIZE + px % TILE_SIZE];
      };
      const heights = new Float32Array(meshSize * meshSize);
      for (let row = 0; row < meshSize; row++) {
        for (let column = 0; column < meshSize; column++) {
          const px = originX + column * sourcePixelSpan / intervals;
          const py = originY + row * sourcePixelSpan / intervals;
          const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
          heights[row * meshSize + column] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy)
            + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
        }
      }
      return new Cesium.HeightmapTerrainData({
        buffer: heights, width: meshSize, height: meshSize,
        childTileMask: terrainChildMask(x, y, level, maximumRenderLevel, coverage),
      });
    },
    async sampleHeight(longitude, latitude, options) {
      return (await provider.sampleHeights([{ longitude, latitude }], options))[0];
    },
    async sampleHeights(points, { level = maximumLevel } = {}) {
      level = Math.max(0, Math.min(maximumLevel, Math.floor(level)));
      const indices = [], positions = [], result = points.map(() => 0);
      points.forEach(({ longitude, latitude }, index) => {
        if (insideBounds(longitude, latitude)) {
          indices.push(index); positions.push(terrainPixelPosition(longitude, latitude, level));
        }
      });
      const values = await samplePixelPositions(positions, level);
      values.forEach((height, i) => { result[indices[i]] = height; });
      return result;
    },
  };
  return provider;
}
