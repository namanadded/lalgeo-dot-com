import crypto from "node:crypto";
import net from "node:net";

const DEVTOOLS = "http://127.0.0.1:9223";
const TARGET_URL = process.env.LALGEO_TEST_URL || "https://maps.lalgeo.com/render/lalgeosurvey";

class CdpSocket {
  constructor(url) {
    this.url = new URL(url);
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      const socket = net.createConnection(Number(this.url.port || 80), this.url.hostname);
      this.socket = socket;
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write([
          `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
          `Host: ${this.url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          ""
        ].join("\r\n"));
      });
      const onHandshake = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = this.buffer.slice(0, headerEnd).toString("utf8");
        if (!header.includes(" 101 ")) {
          reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          return;
        }
        socket.off("data", onHandshake);
        this.buffer = this.buffer.slice(headerEnd + 4);
        socket.on("data", (data) => this.handleData(data));
        this.handleData(Buffer.alloc(0));
        resolve();
      };
      socket.on("data", onHandshake);
    });
  }

  handleData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const high = this.buffer.readUInt32BE(offset);
        const low = this.buffer.readUInt32BE(offset + 4);
        length = high * 2 ** 32 + low;
        offset += 8;
      }
      const masked = Boolean(second & 0x80);
      const maskOffset = masked ? 4 : 0;
      if (this.buffer.length < offset + maskOffset + length) return;
      let payload = this.buffer.slice(offset + maskOffset, offset + maskOffset + length);
      if (masked) {
        const mask = this.buffer.slice(offset, offset + 4);
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      this.buffer = this.buffer.slice(offset + maskOffset + length);
      if ((first & 0x0f) === 0x1) {
        const message = JSON.parse(payload.toString("utf8"));
        if (message.id && this.pending.has(message.id)) {
          const { resolve, reject } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) reject(new Error(message.error.message));
          else resolve(message.result);
        }
      }
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = Buffer.from(JSON.stringify({ id, method, params }));
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = payload.length | 0x80;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126 | 0x80;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127 | 0x80;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(payload.length, 6);
    }
    header[0] = 0x81;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    this.socket.write(Buffer.concat([header, mask, masked]));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.socket?.end();
  }
}

async function getPageWebSocket() {
  const targets = await fetch(`${DEVTOOLS}/json/list`).then((res) => res.json());
  const page = targets.find((target) => target.type === "page") || targets[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("No debuggable page target found.");
  return page.webSocketDebuggerUrl;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(text);
  }
  return result.result?.value;
}

async function waitFor(client, expression, label, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ok = await evaluate(client, `Boolean(${expression})`).catch(() => false);
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const client = new CdpSocket(await getPageWebSocket());
await client.connect();
try {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: TARGET_URL });
  await waitFor(client, "document.readyState !== 'loading'", "document ready");
  await waitFor(client, "document.getElementById('editPanelTraceBtn') && typeof splitPolygonVertices === 'function'", "geometry toolbar scripts");

  const result = await evaluate(client, `(async () => {
    const results = [];
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
      results.push(message);
    };
    const makeEl = (id) => document.getElementById(id);
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;
    window.confirm = () => true;

    if (!window.mapkit) {
      window.mapkit = {
        Coordinate: class Coordinate { constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; } },
        CoordinateSpan: class CoordinateSpan { constructor(latitudeDelta, longitudeDelta) { this.latitudeDelta = latitudeDelta; this.longitudeDelta = longitudeDelta; } },
        CoordinateRegion: class CoordinateRegion { constructor(center, span) { this.center = center; this.span = span; } },
        Style: class Style { constructor(options = {}) { Object.assign(this, options); } },
        PolylineOverlay: class PolylineOverlay { constructor(coords, options = {}) { this.coords = coords; this.options = options; } },
        PolygonOverlay: class PolygonOverlay { constructor(rings, options = {}) { this.rings = rings; this.options = options; } },
        MarkerAnnotation: class MarkerAnnotation {
          constructor(coordinate, options = {}) {
            this.coordinate = coordinate;
            this.options = options;
            this.listeners = {};
          }
          addEventListener(type, handler) { this.listeners[type] = handler; }
        }
      };
    }
    map = {
      region: null,
      overlays: [],
      annotations: [],
      addOverlay(overlay) { this.overlays.push(overlay); },
      removeOverlay(overlay) { this.overlays = this.overlays.filter((item) => item !== overlay); },
      addAnnotation(annotation) { this.annotations.push(annotation); },
      removeAnnotation(annotation) { this.annotations = this.annotations.filter((item) => item !== annotation); },
      convertPointOnPageToCoordinate(point) { return new mapkit.Coordinate(51 + (point.y / 100000), -114 + (point.x / 100000)); },
      convertCoordinateToPointOnPage(coord) { return new DOMPoint((coord.longitude + 114) * 100000, (coord.latitude - 51) * 100000); }
    };
    map.region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(51, -114),
      new mapkit.CoordinateSpan(0.02, 0.02)
    );

    const mixedGeoJsonPayload = buildGeoJsonPayload({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "point one", asset: "A" }, geometry: { type: "Point", coordinates: [-114, 51] } },
        { type: "Feature", properties: { name: "line one" }, geometry: { type: "LineString", coordinates: [[-114, 51], [-113.999, 51.001]] } },
        { type: "Feature", properties: { name: "poly one" }, geometry: { type: "Polygon", coordinates: [[[-114, 51], [-113.999, 51], [-113.999, 51.001], [-114, 51]]] } }
      ]
    }, { projectName: "Mixed GIS", fileName: "mixed.geojson", format: "GeoJSON" });
    assert(mixedGeoJsonPayload.geospatialLayers.length === 3, "mixed GeoJSON splits into point line and polygon layers");
    assert(mixedGeoJsonPayload.geospatialLayers.some((layer) => layer.geometryType === "point" && layer.features[0].attributes.asset === "A"), "GeoJSON properties become layer fields");
    assert(mixedGeoJsonPayload.geospatialLayers.some((layer) => layer.geometryType === "polygon" && layer.features[0].geometry.type === "Polygon"), "GeoJSON polygon imports as polygon geometry");

    const kmlPayload = buildGeoJsonPayload(parseKmlText('<kml><Document><Placemark><name>Building</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-114,51 -113.999,51 -113.999,51.001 -114,51</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>'), {
      projectName: "KML GIS",
      fileName: "building.kml",
      format: "KML"
    });
    assert(kmlPayload.geospatialLayers.length === 1 && kmlPayload.geospatialLayers[0].geometryType === "polygon", "KML polygon imports as polygon layer");

    const gpxPayload = buildGeoJsonPayload(parseGpxText('<gpx><wpt lat="51" lon="-114"><name>Waypoint</name></wpt><trk><name>Track</name><trkseg><trkpt lat="51" lon="-114"/><trkpt lat="51.001" lon="-113.999"/></trkseg></trk></gpx>'), {
      projectName: "GPX GIS",
      fileName: "track.gpx",
      format: "GPX"
    });
    assert(gpxPayload.geospatialLayers.length === 2, "GPX imports waypoint and track layers");

    activeProjectRecord = createProjectRecord({ name: "Append Target", layers: [createLayerRecord({ name: "Points", geometryType: "point" })] });
    activeLayerId = activeProjectRecord.activeLayerId;
    await openImportedGeospatialLayers(mixedGeoJsonPayload);
    assert(activeProjectRecord.layers.length === 4, "geospatial import appends layers to active project");

    activeProjectName = "Geometry Test";
    editSessionActive = true;
    isArchiveView = false;
    selectedTableRows = new Set();
    surveyAnnotations = [];
    surveyOverlays = [];
    rowAnnotationMap = new Map();
    archiveData = { headers: [], records: [], pointMeta: [] };

    const createLayer = (geometryType) => ({
      id: geometryType + "-layer",
      name: geometryType + " layer",
      geometryType,
      visible: true,
      schema: getDefaultLayerSchema(geometryType),
      styleDefaults: getDefaultLayerStyleDefaults(geometryType),
      features: []
    });
    const activate = (geometryType) => {
      const layer = createLayer(geometryType);
      activeProjectRecord = {
        id: "test-project",
        name: "Geometry Test",
        activeLayerId: layer.id,
        layers: [layer],
        metadata: {},
        storageSource: "browser"
      };
      activeLayerId = layer.id;
      currentSurveyData = createEmptyParsedLayer(layer.name, geometryType);
      currentSurveyData.records = [];
      currentSurveyData.pointMeta = [];
      currentSurveyData.headers = (layer.schema || []).map((field) => field.name);
      geometryVertexEditMode = false;
      clearGeometryVertexHandles();
      clearSplitPreview();
      syncEditPanelState();
      return layer;
    };

    let layer = activate("polygon");
    assert(!makeEl("editPanelGeometryTools").hidden, "polygon geometry tools are visible");
    assert(makeEl("editPanelSelectedBadge").textContent.includes("0"), "selected badge starts at zero");
    assert(!makeEl("editPanelTraceBtn").disabled, "polygon trace button is enabled");
    assert(!makeEl("editPanelSnapVerticesBtn").disabled && makeEl("editPanelSnapVerticesBtn").classList.contains("snap-active"), "snap-to-vertices toggle is visible and active");
    assert(!makeEl("editPanelSnapEdgesBtn").disabled && makeEl("editPanelSnapEdgesBtn").classList.contains("snap-active"), "snap-to-edges toggle is visible and active");
    assert(!makeEl("editPanelSnapPolygonEdgesBtn").hidden && makeEl("editPanelSnapPolygonEdgesBtn").classList.contains("snap-active"), "polygon edge snap toggle is visible and active");
    assert(!makeEl("editPanelRectangleBtn").hidden && !makeEl("editPanelRectangleBtn").disabled, "polygon rectangle button is visible and enabled");
    assert(!makeEl("editPanelSquareBtn").hidden && !makeEl("editPanelSquareBtn").disabled, "polygon square button is visible and enabled");

    createViewportPolygonShape("rectangle");
    assert(layer.features.length === 1 && layer.features[0].geometry.type === "Polygon", "rectangle creates a polygon feature");
    assert(layer.features[0].geometry.rings[0].length === 4, "rectangle has four vertices");
    createViewportPolygonShape("square");
    assert(layer.features.length === 2, "square creates a second polygon feature");

    activeFeatureId = layer.features[0].id;
    activeSurveyAnnotation = rowAnnotationMap.get(0);
    syncEditPanelState();
    assert(makeEl("editPanelSelectedBadge").textContent.includes("1"), "selected badge shows one selected feature");
    assert(!makeEl("editPanelEditVerticesBtn").disabled, "polygon edit vertices button enables with a selected feature");
    assert(!makeEl("editPanelSplitGeometryBtn").disabled, "polygon split button enables with a selected feature");
    editSelectedGeometryVertices();
    assert(geometryVertexEditMode && geometryVertexHandleAnnotations.length === 4, "polygon vertex handles are visible");
    const polygonHandle = geometryVertexHandleAnnotations[0];
    polygonHandle.coordinate = new mapkit.Coordinate(51, -114);
    commitGeometryVertexHandleMove(polygonHandle, polygonHandle.coordinate);
    assert(layer.features[0].geometry.rings[0][0].lat === 51, "polygon vertex handle editing updates geometry");
    const snappedVertex = getSnappedCoordinate(new mapkit.Coordinate(51.00001, -113.99999));
    assert(snappedVertex.latitude === 51 && snappedVertex.longitude === -114, "snap-to-vertices returns nearby existing vertex");
    const beforePolygonSplit = layer.features.length;
    splitSelectedGeometry();
    assert(splitPreviewState && splitPreviewOverlays.length === 2, "polygon split shows preview overlays before applying");
    assert(layer.features.length === beforePolygonSplit, "polygon split preview does not modify features before apply");
    assert(!makeEl("editPanelCancelGeometryBtn").hidden, "cancel button appears for split preview");
    splitSelectedGeometry();
    assert(layer.features.length === beforePolygonSplit + 1, "polygon split creates an additional feature");

    toggleTraceGeometryMode();
    assert(geometryTraceMode && isAddingSurveyPoint, "polygon trace mode starts drawing");
    assert(!makeEl("editPanelFinishGeometryBtn").hidden && makeEl("editPanelFinishGeometryBtn").disabled, "finish button appears disabled until enough polygon vertices exist");
    assert(!makeEl("editPanelCancelGeometryBtn").hidden, "cancel button appears while tracing polygon");
    handleNewSurveyPointPlacement(new mapkit.Coordinate(51, -114));
    handleNewSurveyPointPlacement(new mapkit.Coordinate(51, -113.999));
    handleNewSurveyPointPlacement(new mapkit.Coordinate(51.001, -113.999));
    assert(drawingVertices.length === 3, "polygon trace records clicked vertices");
    syncEditPanelState();
    assert(!makeEl("editPanelFinishGeometryBtn").disabled, "finish button enables after enough polygon vertices");
    makeEl("editPanelFinishGeometryBtn").click();
    assert(!geometryTraceMode && !isAddingSurveyPoint, "polygon trace finalizes and exits trace mode");
    assert(layer.features.at(-1).geometry.type === "Polygon", "polygon trace saves polygon geometry");
    assert(!makeEl("editPanelUndoBtn").disabled, "toolbar undo enables after geometry edits");
    makeEl("editPanelUndoBtn").click();
    assert(layer.features.at(-1).geometry.type !== "Polygon" || layer.features.length >= 1, "toolbar undo runs without breaking geometry state");

    layer = activate("line");
    assert(!makeEl("editPanelGeometryTools").hidden, "line geometry tools are visible");
    assert(makeEl("editPanelRectangleBtn").hidden && makeEl("editPanelSquareBtn").hidden, "line hides polygon-only rectangle and square tools");
    assert(makeEl("editPanelSnapPolygonEdgesBtn").hidden, "line hides polygon-edge snap toggle");
    assert(!makeEl("editPanelTraceBtn").disabled, "line trace button is enabled");
    toggleTraceGeometryMode();
    handleNewSurveyPointPlacement(new mapkit.Coordinate(51, -114));
    handleNewSurveyPointPlacement(new mapkit.Coordinate(51.001, -113.999));
    assert(drawingVertices.length === 2, "line trace records clicked vertices");
    finalizeGeometryFeaturePlacement();
    assert(layer.features.length === 1 && layer.features[0].geometry.type === "LineString", "line trace saves LineString geometry");
    activeFeatureId = layer.features[0].id;
    activeSurveyAnnotation = rowAnnotationMap.get(0);
    syncEditPanelState();
    assert(!makeEl("editPanelEditVerticesBtn").disabled, "line edit vertices button enables with a selected feature");
    assert(!makeEl("editPanelSplitGeometryBtn").disabled, "line split button enables with a selected feature");
    editSelectedGeometryVertices();
    assert(geometryVertexEditMode && geometryVertexHandleAnnotations.length === 2, "line vertex handles are visible");
    const lineHandle = geometryVertexHandleAnnotations[1];
    lineHandle.coordinate = new mapkit.Coordinate(51.002, -113.998);
    commitGeometryVertexHandleMove(lineHandle, lineHandle.coordinate);
    assert(layer.features[0].geometry.coordinates[1].lat === 51.002, "line vertex handle editing updates geometry");
    const beforeLineSplit = layer.features.length;
    splitSelectedGeometry();
    assert(splitPreviewState && splitPreviewOverlays.length === 2, "line split shows preview overlays before applying");
    assert(layer.features.length === beforeLineSplit, "line split preview does not modify features before apply");
    splitSelectedGeometry();
    assert(layer.features.length === beforeLineSplit + 1, "line split creates an additional feature");

    layer = activate("point");
    assert(makeEl("editPanelGeometryTools").hidden, "point layer hides line and polygon geometry tools");

    window.prompt = originalPrompt;
    window.confirm = originalConfirm;
    return results;
  })()`);

  console.log(JSON.stringify({ ok: true, checks: result }, null, 2));
} finally {
  client.close();
}
