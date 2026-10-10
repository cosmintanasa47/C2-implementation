const MAX_TRACK_POINTS = 300;

/** Positions received from the C2 server, drawn on the monitor globe: reporting sensors and the streamed point. */
export function createFeedLayer(Cesium, viewer) {
  const sensors = new Map(), track = [];
  let head = null, line = null, disposed = false;
  const redraw = () => { if (!disposed && !viewer.isDestroyed()) viewer.scene.requestRender(); };
  const label = (text, color) => ({
    text, font: '600 12px Inter, -apple-system, sans-serif', fillColor: Cesium.Color.WHITE, showBackground: true,
    backgroundColor: Cesium.Color.fromCssColorString('#10181d').withAlpha(0.85), backgroundPadding: new Cesium.Cartesian2(7, 4),
    pixelOffset: new Cesium.Cartesian2(0, -22), outlineColor: color, disableDepthTestDistance: Number.POSITIVE_INFINITY,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 400_000),
  });
  const point = (color, size) => ({
    pixelSize: size, color, outlineColor: Cesium.Color.fromCssColorString('#10181d'), outlineWidth: 2,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
  });
  return {
    /** Adds the sensor once; the same id keeps its marker. */
    addSensor({ id, name, latitude, longitude, color = '#62a9ff' }) {
      if (disposed || sensors.has(id)) return;
      const tint = Cesium.Color.fromCssColorString(color);
      sensors.set(id, viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(longitude, latitude), point: point(tint, 11), label: label(name, tint) }));
      redraw();
    },
    /** Latest streamed position, with a trail of the previous ones. */
    addPoint({ latitude, longitude }) {
      if (disposed) return;
      const position = Cesium.Cartesian3.fromDegrees(longitude, latitude);
      track.push(position);
      if (track.length > MAX_TRACK_POINTS) track.shift();
      const tint = Cesium.Color.fromCssColorString('#ff6b5e');
      if (!head) head = viewer.entities.add({ position, point: point(tint, 13), label: label('Poziție server', tint) });
      else head.position = position;
      if (!line && track.length > 1) line = viewer.entities.add({ polyline: { positions: new Cesium.CallbackProperty(() => track.slice(), false), width: 3, material: tint.withAlpha(0.8), clampToGround: true } });
      redraw();
    },
    lastPoint: () => track.length ? Cesium.Cartographic.fromCartesian(track.at(-1)) : null,
    clear() {
      for (const entity of [...sensors.values(), head, line]) if (entity) viewer.entities.remove(entity);
      sensors.clear(); track.length = 0; head = line = null; redraw();
    },
    destroy() { if (!disposed) { this.clear(); disposed = true; } },
  };
}
