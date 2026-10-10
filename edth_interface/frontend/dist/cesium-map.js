import { defaultMapConfig, normalizeMapConfig } from './map-config.js';
import { createRomaniaStore, createRomaniaImagery, createRomaniaBuildings, ROMANIA_BOUNDS } from './romania-map.js';
import { createRomaniaTerrain } from './romania-terrain.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const copyConfig = (config) => config ? {
  ...config,
  bounds: config.bounds ? [...config.bounds] : null,
  initialView: config.initialView ? [...config.initialView] : null,
} : null;

function validView(view) {
  return Array.isArray(view) && view.length === 4 && view.every(Number.isFinite)
    && view[0] >= -180 && view[2] <= 180 && view[1] >= -90 && view[3] <= 90
    && view[0] < view[2] && view[1] < view[3];
}

function prepareSource(Cesium, input) {
  const config = normalizeMapConfig(input, document.baseURI);
  if (!validView(config.initialView)) throw new Error('Vederea inițială trebuie să fie [vest, sud, est, nord], în grade WGS84.');
  const tags = config.url.match(/\{[^}]*\}/g) || [];
  if (tags.some((tag) => !['{z}', '{x}', '{y}', '{reverseY}'].includes(tag))) {
    throw new Error('Șablonul local acceptă numai {z}, {x}, {y} sau {reverseY}.');
  }
  const tilingScheme = config.projection === 'EPSG:4326'
    ? new Cesium.GeographicTilingScheme()
    : new Cesium.WebMercatorTilingScheme();
  const requestedRectangle = config.bounds
    ? Cesium.Rectangle.fromDegrees(...config.bounds)
    : tilingScheme.rectangle;
  const rectangle = Cesium.Rectangle.intersection(requestedRectangle, tilingScheme.rectangle);
  if (!rectangle || rectangle.width <= 0 || rectangle.height <= 0) {
    throw new Error('Limitele nu intersectează aria validă a proiecției.');
  }
  // Count the tiles Cesium can request at the minimum level before creating a layer.
  // Conservative corner inclusion also protects sets whose bounds lie on tile edges.
  const northWest = tilingScheme.positionToTileXY(Cesium.Rectangle.northwest(rectangle), config.minimumLevel);
  const southEast = tilingScheme.positionToTileXY(Cesium.Rectangle.southeast(rectangle), config.minimumLevel);
  if (!northWest || !southEast) throw new Error('Limitele nu pot fi convertite în coordonate de tile.');
  const tileCount = (southEast.x - northWest.x + 1) * (southEast.y - northWest.y + 1);
  if (!Number.isFinite(tileCount) || tileCount < 1 || tileCount > 4) {
    throw new Error(`Limitele acoperă ${tileCount} tile-uri la nivelul minim; sunt acceptate cel mult 4. Redu nivelul minim sau restrânge limitele.`);
  }
  const reverseY = tilingScheme.getNumberOfYTilesAtLevel(config.minimumLevel) - northWest.y - 1;
  const tileUrl = config.url.replace(/\{(z|x|y|reverseY)\}/g, (_, tag) => ({
    z: config.minimumLevel, x: northWest.x, y: northWest.y, reverseY,
  }[tag]));
  return { config: copyConfig(config), tilingScheme, rectangle, tileUrl };
}

async function probeImage(url, signal) {
  const response = await fetch(new URL(url, document.baseURI), {
    signal,
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Tile-ul de verificare nu este disponibil (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException('Operație anulată.', 'AbortError');
  const objectUrl = URL.createObjectURL(blob);
  const preview = new Image();
  let abortListener;
  try {
    preview.src = objectUrl;
    await Promise.race([
      preview.decode(),
      new Promise((_, reject) => {
        abortListener = () => reject(new DOMException('Operație anulată.', 'AbortError'));
        signal.addEventListener('abort', abortListener, { once: true });
        if (signal.aborted) abortListener();
      }),
    ]);
    if (!preview.naturalWidth || !preview.naturalHeight) throw new Error('Imagine goală.');
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Tile-ul de verificare nu este o imagine validă. Verifică extensia și calea locală.');
  } finally {
    signal.removeEventListener('abort', abortListener);
    preview.removeAttribute('src');
    URL.revokeObjectURL(objectUrl);
  }
}

/** Cartography only: no operational objects, backend connections, or remote basemap. */
export function createLocalMap({ container, onStatus = () => {}, onCamera = () => {}, initialMode = '3d', onViewerReady = () => {} }) {
  const Cesium = window.Cesium;
  let viewer;
  let activeSource = null;
  let pendingController = null;
  let generation = 0;
  let disposed = false;
  let mode = initialMode === '2d' ? '2d' : '3d';
  let sourcePending = false;
  let stickyError = null;
  let setupError = null;
  let lastStatus = '';
  let terrainProvider = null;
  let terrainPromise = null;
  let terrainWarning = null;
  let pendingPlace = null;
  let navigationGeneration = 0;
  const removeListeners = [];

  function status(state, message) {
    if (disposed) return;
    const signature = `${state}:${message}`;
    if (lastStatus !== signature) {
      lastStatus = signature;
      onStatus({ state, message });
    }
  }

  function reportCamera() {
    if (!viewer || disposed) return;
    const position = viewer.camera.positionCartographic;
    if (!position) return;
    onCamera({
      longitude: Cesium.Math.toDegrees(position.longitude),
      latitude: Cesium.Math.toDegrees(position.latitude),
      height: position.height,
    });
    activeSource?.buildings?.update();
  }

  function fit() {
    if (!viewer || !activeSource || disposed) return;
    viewer.camera.cancelFlight();
    const config = activeSource.config;
    viewer.camera.setView({ destination: Cesium.Rectangle.fromDegrees(...(config.bounds || config.initialView)) });
    viewer.scene.requestRender();
    reportCamera();
    if (pendingPlace && !sourcePending) {
      const place = pendingPlace;
      pendingPlace = null;
      flyToPlace(place);
    }
  }

  function releaseSource(source) {
    if (!source) return;
    source.removeError?.();
    source.buildings?.destroy();
    if (source.layer) viewer.imageryLayers.remove(source.layer, true);
    source.store?.destroy();
  }

  function readyMessage() {
    if (activeSource?.config.kind === 'romania') return `România · străzi și clădiri OSM locale${terrainProvider ? ' · relief local' : ' · relief indisponibil'}`;
    return `${activeSource?.config.name || 'Hartă'} · tile-uri locale`;
  }

  function renderAfterCompletion(provider, method) {
    const original = provider[method].bind(provider);
    provider[method] = (...args) => {
      const result = original(...args);
      return result?.finally(() => {
        // Native fetch/decompression bypasses Cesium's RequestScheduler events.
        // Explicit rendering must wake when a custom tile becomes available.
        if (!disposed && viewer) viewer.scene.requestRender();
      });
    };
  }

  async function useRomania() {
    if (disposed || !viewer || setupError) return false;
    const requestGeneration = ++generation;
    pendingController?.abort();
    sourcePending = true;
    stickyError = null;
    let store;
    let nextSource;
    try {
      status('loading', 'Încarc harta detaliată a României…');
      // A missing terrain dataset must not hide the available street map.
      terrainPromise ||= createRomaniaTerrain(Cesium, { baseUrl: './maps/terrain/' }).then((provider) => {
        if (disposed) return null;
        terrainProvider = provider;
        terrainWarning = null;
        renderAfterCompletion(provider, 'requestTileGeometry');
        removeListeners.push(provider.errorEvent.addEventListener((error) => {
          terrainWarning = error.message || 'Unele date de relief local nu sunt disponibile.';
          if (activeSource?.config.kind === 'romania') status('error', terrainWarning);
        }));
        return provider;
      }).catch((error) => {
        terrainPromise = null;
        terrainWarning = 'Relieful local nu este disponibil. Harta stradală rămâne utilizabilă.';
        console.warn('Romania terrain', error);
        return null;
      });
      store = await createRomaniaStore(Cesium);
      // Verify a real country-level tile before replacing the current layer.
      await store.tile(36, 22, 6);
      await terrainPromise;
      if (disposed || requestGeneration !== generation) { store.destroy(); return false; }
      const config = { kind: 'romania', name: 'România · OpenStreetMap', url: './maps/romania/', scheme: 'xyz', projection: 'EPSG:3857',
        minimumLevel: 0, maximumLevel: 19, sourceMaximumLevel: 14, bounds: [...store.manifest.bounds], initialView: [...ROMANIA_BOUNDS],
        credit: '© OpenStreetMap contributors · Shortbread / Geofabrik · date locale' };
      const provider = createRomaniaImagery(Cesium, store);
      renderAfterCompletion(provider, 'requestImage');
      nextSource = { config, provider, store, layer: null, failed: false, sawProgress: false };
      nextSource.removeError = provider.errorEvent.addEventListener((error) => sourceError(nextSource, error));
      nextSource.layer = viewer.imageryLayers.addImageryProvider(provider);
      nextSource.buildings = createRomaniaBuildings(Cesium, viewer, store, () => terrainProvider);
      const previous = activeSource;
      activeSource = nextSource;
      sourcePending = false;
      releaseSource(previous);
      // Commit the terrain together with this source, after the generation check.
      // An earlier asynchronous Romania request must never change a newer XYZ source.
      viewer.terrainProvider = terrainProvider || new Cesium.EllipsoidTerrainProvider();
      fit();
      status(terrainWarning ? 'error' : 'ready', terrainWarning || readyMessage());
      return true;
    } catch (error) {
      if (disposed || requestGeneration !== generation) { store?.destroy(); return false; }
      if (nextSource && activeSource !== nextSource) releaseSource(nextSource);
      else if (activeSource?.store !== store) store?.destroy();
      sourcePending = false;
      stickyError = error.message || 'Pachetul local România nu poate fi încărcat.';
      status('error', stickyError);
      return false;
    }
  }

  function sourceError(source, error) {
    // Requests from a removed layer must never change the new source's status.
    if (activeSource !== source || disposed) return;
    source.failed = true;
    if (error) error.retry = false;
    if (!sourcePending) {
      stickyError = `Lipsesc tile-uri sau sursa „${source.config.name}” nu răspunde. Verifică URL-ul, schema și nivelurile disponibile.`;
      status('error', stickyError);
    }
  }

  async function setSource(input) {
    if (disposed) return false;
    if (setupError || !viewer) {
      status('error', setupError || 'Harta Cesium nu este disponibilă.');
      return false;
    }
    const requestGeneration = ++generation;
    pendingController?.abort();
    const controller = new AbortController();
    pendingController = controller;
    sourcePending = true;
    let timedOut = false;
    let timeout;
    let nextSource;
    try {
      const prepared = prepareSource(Cesium, input);
      status('loading', `Verific sursa locală „${prepared.config.name}”…`);
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 10000);
      await probeImage(prepared.tileUrl, controller.signal);
      clearTimeout(timeout);
      if (disposed || requestGeneration !== generation) return false;

      const provider = new Cesium.UrlTemplateImageryProvider({
        url: prepared.config.url,
        tilingScheme: prepared.tilingScheme,
        rectangle: prepared.rectangle,
        minimumLevel: prepared.config.minimumLevel,
        maximumLevel: prepared.config.maximumLevel,
        credit: new Cesium.Credit(escapeHtml(prepared.config.credit), true),
        enablePickFeatures: false,
      });
      nextSource = { config: prepared.config, provider, layer: null, failed: false, sawProgress: false };
      nextSource.removeError = provider.errorEvent.addEventListener((error) => sourceError(nextSource, error));
      nextSource.layer = viewer.imageryLayers.addImageryProvider(provider);
      nextSource.layer.brightness = 0.72;
      nextSource.layer.saturation = 0.72;

      const previousSource = activeSource;
      activeSource = nextSource;
      sourcePending = false;
      stickyError = null;
      releaseSource(previousSource);
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      status('loading', `Încarc tile-urile locale „${activeSource.config.name}”…`);
      fit();
      return true;
    } catch (error) {
      if (disposed || requestGeneration !== generation) return false;
      if (nextSource && activeSource !== nextSource) {
        nextSource.removeError?.();
        if (nextSource.layer) viewer.imageryLayers.remove(nextSource.layer, true);
      }
      sourcePending = false;
      stickyError = timedOut
        ? 'Sursa locală nu a răspuns în 10 secunde. Verifică serverul de tile-uri.'
        : error.message || 'Sursa locală nu poate fi încărcată.';
      status('error', stickyError);
      return false;
    } finally {
      clearTimeout(timeout);
      if (pendingController === controller) pendingController = null;
    }
  }

  function setMode(nextMode) {
    if (!viewer || disposed || !['2d', '3d'].includes(nextMode)) return false;
    if (nextMode === mode) return true;
    viewer.camera.cancelFlight();
    const center = captureView();
    mode = nextMode;
    viewer.scene.globe.enableLighting = mode === '3d';
    if (mode === '2d') viewer.scene.morphTo2D(0);
    else viewer.scene.morphTo3D(0);
    restoreView(center);
    reportCamera();
    viewer.scene.requestRender();
    return true;
  }

  function captureView() {
    const ray = viewer.camera.getPickRay(new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2));
    const point = ray && viewer.scene.globe.pick(ray, viewer.scene);
    const center = point ? Cesium.Cartographic.fromCartesian(point) : viewer.camera.positionCartographic;
    const range = point && mode === '3d' ? Cesium.Cartesian3.distance(viewer.camera.positionWC, point) : Math.abs(viewer.camera.positionCartographic.height);
    const frustum = viewer.camera.frustum;
    const viewHeight = mode === '2d' ? Math.abs(frustum.top - frustum.bottom) : 2 * range * Math.tan((frustum.fovy || Math.PI / 3) / 2);
    return { longitude: Cesium.Math.toDegrees(center.longitude), latitude: Cesium.Math.toDegrees(center.latitude),
      ground: Math.max(0, center.height || 0), viewHeight: Math.max(100, viewHeight || range), heading: viewer.camera.heading || 0 };
  }

  function restoreView({ longitude, latitude, ground = 0, viewHeight, heading = 0 }) {
    if (mode === '2d') {
      const spanY = Math.min(150, viewHeight / 111320);
      const spanX = Math.min(350, spanY * Math.max(1, viewer.canvas.clientWidth) / Math.max(1, viewer.canvas.clientHeight) / Math.max(0.1, Math.cos(Cesium.Math.toRadians(latitude))));
      viewer.camera.setView({ destination: Cesium.Rectangle.fromDegrees(Math.max(-179.9, longitude - spanX / 2), Math.max(-85, latitude - spanY / 2), Math.min(179.9, longitude + spanX / 2), Math.min(85, latitude + spanY / 2)) });
    } else {
      const range = Math.max(100, viewHeight / (2 * Math.tan(Math.PI / 6)));
      const pitch = Cesium.Math.toRadians(range < 80000 ? -55 : -88);
      viewer.camera.lookAt(Cesium.Cartesian3.fromDegrees(longitude, latitude, ground), new Cesium.HeadingPitchRange(heading, pitch, range));
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  }

  function flyToPlace({ lon, lat, zoom = 14, height } = {}) {
    if (!viewer || disposed || !Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -85 || lat > 85) return false;
    // Preserve a destination selected while the first local pack is loading.
    if (sourcePending || !activeSource) { pendingPlace = { lon, lat, zoom, height }; return true; }
    const navigation = ++navigationGeneration;
    const sourceGeneration = generation;
    const desiredHeight = Number.isFinite(height) ? Math.max(100, height) : 40075016.7 * Math.cos(Cesium.Math.toRadians(lat)) / (256 * 2 ** Math.min(19, Math.max(0, zoom))) * viewer.canvas.clientHeight * 0.866;
    const knownGround = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) || 0;
    const focus = ground => {
      if (disposed || navigation !== navigationGeneration || sourceGeneration !== generation) return;
      if (mode === '2d') {
        restoreView({ longitude: lon, latitude: lat, ground, viewHeight: desiredHeight * 1.15 });
        reportCamera(); viewer.scene.requestRender();
      } else {
        viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, ground), 1), {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), desiredHeight / Math.sin(Cesium.Math.toRadians(55))),
          duration: 1.15, complete: reportCamera,
        });
      }
    };
    // The destination may not be rendered yet. Read its DEM before aiming a
    // tilted camera, otherwise a sea-level focus can put a mountain city offscreen.
    if (mode === '3d' && terrainProvider && activeSource.config.kind === 'romania') {
      void terrainProvider.sampleHeight(lon, lat).then(focus, () => focus(knownGround));
    } else focus(knownGround);
    return true;
  }

  function zoom(direction) {
    if (!viewer || disposed) return;
    const distance = Math.max(100, Math.abs(viewer.camera.positionCartographic.height) * 0.4);
    if (direction > 0) viewer.camera.zoomIn(distance);
    else viewer.camera.zoomOut(distance);
    viewer.scene.requestRender();
    reportCamera();
  }

  const controls = {
    setSource,
    useRomania,
    flyToPlace,
    setMode,
    zoomIn: () => zoom(1),
    zoomOut: () => zoom(-1),
    home: () => { pendingPlace = null; ++navigationGeneration; fit(); },
    resize() {
      if (viewer && !disposed) {
        viewer.resize();
        viewer.scene.requestRender();
      }
    },
    getConfig: () => copyConfig(activeSource?.config),
    getMode: () => mode,
    getBuildingState: () => activeSource?.buildings?.getState() || null,
    destroy() {
      if (disposed) return;
      disposed = true;
      ++generation;
      pendingController?.abort();
      releaseSource(activeSource);
      for (const removeListener of removeListeners) removeListener();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      activeSource = null;
      viewer = null;
    },
  };

  try {
    if (!Cesium) throw new Error('Biblioteca Cesium locală lipsește. Rulează npm run prepare:cesium și reîncarcă pagina.');
    Cesium.Ion.defaultAccessToken = '';
    // Use the copied module workers, rather than embedded blob/importScripts workers.
    // This preserves script-src 'self' and keeps every worker file locally inspectable.
    delete window.CESIUM_WORKERS;
    viewer = new Cesium.Viewer(container, {
      sceneMode: mode === '2d' ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D,
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      animation: false,
      timeline: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyBox: false,
      skyAtmosphere: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      shouldAnimate: false,
      showRenderLoopErrors: false,
    });
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#142335');
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 75;
    // Fine cartography needs sub-pixel texture error; Cesium's terrain-oriented
    // default can leave street labels enlarged and stop before z14 footprints.
    viewer.scene.globe.maximumScreenSpaceError = 0.5;
    viewer.scene.globe.enableLighting = mode === '3d';
    viewer.scene.light = new Cesium.DirectionalLight({ direction: Cesium.Cartesian3.normalize(new Cesium.Cartesian3(-0.4, -0.1, -0.8), new Cesium.Cartesian3()), intensity: 1.6 });
    // A full-globe bottom layer prevents a regional imagery rectangle stretching to the poles.
    const backdrop = prepareSource(Cesium, defaultMapConfig);
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: backdrop.config.url, tilingScheme: backdrop.tilingScheme, maximumLevel: backdrop.config.maximumLevel,
      credit: new Cesium.Credit('Natural Earth · fundal global'), enablePickFeatures: false,
    }));
    removeListeners.push(viewer.camera.moveEnd.addEventListener(reportCamera));
    removeListeners.push(viewer.scene.globe.tileLoadProgressEvent.addEventListener((remaining) => {
      if (disposed || !activeSource || sourcePending || stickyError || activeSource.failed
        || (terrainWarning && activeSource.config.kind === 'romania')) return;
      if (remaining > 0) {
        activeSource.sawProgress = true;
        status('loading', `Încarc tile-urile locale „${activeSource.config.name}”…`);
      } else if (activeSource.sawProgress) {
        status('ready', readyMessage());
      }
    }));
    removeListeners.push(viewer.scene.renderError.addEventListener((scene, error) => {
      console.error('Cesium render error', error);
      stickyError = 'Cesium nu poate reda harta. Verifică suportul WebGL și reîncarcă pagina.';
      status('error', stickyError);
    }));
    onViewerReady(viewer);
    void useRomania();
  } catch (error) {
    console.error('Cesium initialization error', error);
    setupError = !Cesium ? error.message : 'Harta Cesium nu poate fi inițializată. Verifică WebGL și accelerarea hardware a browserului.';
    for (const removeListener of removeListeners.splice(0)) removeListener();
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    viewer = null;
    status('error', setupError);
  }
  return controls;
}
