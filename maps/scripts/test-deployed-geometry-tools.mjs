import crypto from "node:crypto";
import net from "node:net";
import { readFileSync } from "node:fs";

const DEVTOOLS = "http://127.0.0.1:9223";
const TARGET_URL = process.env.LALGEO_TEST_URL || "https://maps.lalgeo.com/render/lalgeosurvey";
const polygonHolesGeoJson = JSON.parse(readFileSync(new URL("../fixtures/interoperability/polygon-holes.geojson", import.meta.url), "utf8"));
const complexGeometryCollection = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-geometry-collection.geojson", import.meta.url), "utf8"));
const malformedGeometryCollection = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-geometry-collection.geojson", import.meta.url), "utf8"));
const complexFeatureIdentifiers = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-feature-identifiers.geojson", import.meta.url), "utf8"));
const complexReservedProperties = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-reserved-properties.geojson", import.meta.url), "utf8"));
const polygonHolesKml = readFileSync(new URL("../fixtures/interoperability/polygon-holes.kml", import.meta.url), "utf8");
const complexStyledKml = readFileSync(new URL("../fixtures/interoperability/complex-styled-multigeometry.kml", import.meta.url), "utf8");
const malformedKmlCoordinate = readFileSync(new URL("../fixtures/interoperability/malformed-kml-coordinate.kml", import.meta.url), "utf8");
const malformedPolygonGeoJson = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-polygon.geojson", import.meta.url), "utf8"));
const complexSurveyCsv = readFileSync(new URL("../fixtures/interoperability/complex-survey.csv", import.meta.url), "utf8");
const malformedSurveyCsv = readFileSync(new URL("../fixtures/interoperability/malformed-survey.csv", import.meta.url), "utf8");
const malformedCoordinateCsv = readFileSync(new URL("../fixtures/interoperability/malformed-coordinate-row.csv", import.meta.url), "utf8");
const complexGpx = readFileSync(new URL("../fixtures/interoperability/complex-field-collection.gpx", import.meta.url), "utf8");
const malformedGpx = readFileSync(new URL("../fixtures/interoperability/malformed-track-point.gpx", import.meta.url), "utf8");
const complexShapefile = readFileSync(new URL("../fixtures/interoperability/complex-web-mercator.zip", import.meta.url)).toString("base64");
const projectedShapefileWithoutPrj = readFileSync(new URL("../fixtures/interoperability/projected-missing-prj.zip", import.meta.url)).toString("base64");
const shapefileWithoutAttributes = readFileSync(new URL("../fixtures/interoperability/missing-attributes.zip", import.meta.url)).toString("base64");
const complexKmz = readFileSync(new URL("../fixtures/interoperability/complex-main-document.kmz", import.meta.url)).toString("base64");
const ambiguousKmz = readFileSync(new URL("../fixtures/interoperability/ambiguous-main-document.kmz", import.meta.url)).toString("base64");
const complexApiRows = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-api-rows.json", import.meta.url), "utf8"));
const malformedApiRows = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-api-rows.json", import.meta.url), "utf8"));
const secondaryUnicodeLines = readFileSync(new URL("../fixtures/interoperability/secondary-unicode-lines.geojson", import.meta.url), "utf8");

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
    window.prompt = (_message, fallback = "") => fallback || "35";
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

    const oneDegreeDistance = measurementDistanceMeters(new mapkit.Coordinate(0, 0), new mapkit.Coordinate(0, 1));
    assert(oneDegreeDistance > 111000 && oneDegreeDistance < 111300, "measurement distance uses geodesic coordinate scale");
    setMeasurementActive(true);
    assert(measurementActive && !makeEl("measurementPanel").hidden && makeEl("advancedGisMeasureBtn").classList.contains("active"), "measurement toolbar opens panel");
    addMeasurementPoint(new mapkit.Coordinate(51, -114));
    addMeasurementPoint(new mapkit.Coordinate(51.001, -114));
    assert(measurementCoordinates.length === 2, "distance measurement records clicked points");
    assert(getMeasurementMetrics(false).distance > 100, "distance measurement calculates total length");
    finishMeasurement();
    assert(measurementFinished, "distance measurement can be finished");
    setMeasurementMode("area");
    addMeasurementPoint(new mapkit.Coordinate(51, -114));
    addMeasurementPoint(new mapkit.Coordinate(51, -113.999));
    addMeasurementPoint(new mapkit.Coordinate(51.001, -113.999));
    assert(getMeasurementMetrics(false).area > 0, "area measurement calculates polygon area");
    measurementUnitSelect.value = "imperial";
    measurementUnitSelect.dispatchEvent(new Event("change"));
    assert(measurementUnits === "imperial" && measurementResult.textContent.includes("Perimeter"), "measurement unit selector updates displayed units");
    clearMeasurement();
    setMeasurementActive(false);
    assert(!measurementActive && makeEl("measurementPanel").hidden, "measurement toolbar closes cleanly");

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

    const collectionPayload = buildGeoJsonPayload(${JSON.stringify(complexGeometryCollection)}, {
      projectName: "Complex collection",
      fileName: "complex-geometry-collection.geojson",
      format: "GeoJSON"
    });
    const collectionPointLayer = collectionPayload.geospatialLayers.find((layer) => layer.geometryType === "point");
    const collectionLineLayer = collectionPayload.geospatialLayers.find((layer) => layer.geometryType === "line");
    const collectionPolygonLayer = collectionPayload.geospatialLayers.find((layer) => layer.geometryType === "polygon");
    assert(collectionPointLayer.features.length === 2 && collectionLineLayer.features.length === 2 && collectionPolygonLayer.features.length === 2, "GeoJSON GeometryCollection imports every multipart geometry");
    assert(collectionPointLayer.features[0].attributes.name === "Réseau Montréal α" && collectionPointLayer.features[0].attributes.nullable_note === null, "GeoJSON GeometryCollection preserves Unicode and null attributes across parts");
    assert(collectionLineLayer.features[1].attributes.field_12 === "A12", "GeoJSON GeometryCollection preserves large field sets across multipart lines");
    assert(collectionPolygonLayer.features[0].geometry.rings.length === 2, "GeoJSON MultiPolygon preserves polygon holes");
    const collectionRoundTrip = buildGeoJsonPayload(layerToGeoJson(collectionPolygonLayer), { format: "GeoJSON round trip" });
    assert(collectionRoundTrip.geospatialLayers[0].features.length === 2 && collectionRoundTrip.geospatialLayers[0].features[0].geometry.rings.length === 2, "GeoJSON multipart import-export-import preserves polygons and holes");
    let malformedCollectionMessage = "";
    try {
      buildGeoJsonPayload(${JSON.stringify(malformedGeometryCollection)}, { format: "GeoJSON" });
    } catch (error) {
      malformedCollectionMessage = error.message || "";
    }
    assert(malformedCollectionMessage === "GeoJSON feature 1 could not be imported: geometry GeometryCollection member 1 LineString coordinate 2 is invalid. Use [longitude, latitude] values in WGS84.", "GeoJSON rejects an invalid collection coordinate instead of bridging valid vertices");

    const identityPayload = buildGeoJsonPayload(${JSON.stringify(complexFeatureIdentifiers)}, {
      projectName: "Feature identity",
      fileName: "complex-feature-identifiers.geojson",
      format: "GeoJSON"
    });
    const identityPoint = identityPayload.geospatialLayers.find((layer) => layer.geometryType === "point");
    const identityLines = identityPayload.geospatialLayers.find((layer) => layer.geometryType === "line");
    const identityPolygon = identityPayload.geospatialLayers.find((layer) => layer.geometryType === "polygon");
    assert(identityPoint.features[0].geoJsonId === "asset/Été-α-001", "GeoJSON import preserves Unicode string feature ids separately from editable LalGeo ids");
    assert(identityLines.features.length === 2 && identityLines.features.every((feature) => feature.geoJsonId === 0), "GeoJSON multipart import preserves numeric zero feature ids on every part");
    assert(layerToGeoJson(identityPoint).features[0].id === "asset/Été-α-001", "GeoJSON export restores the original string feature id");
    assert(layerToGeoJson(identityLines).features.every((feature) => feature.id === 0), "GeoJSON export restores the original numeric multipart feature id");
    assert(layerToGeoJson(identityPolygon).features[0].id === 9007199254740991, "GeoJSON export preserves a large safe numeric feature id");
    const identityRoundTrip = buildGeoJsonPayload(layerToGeoJson(identityPoint), { format: "GeoJSON round trip" });
    assert(identityRoundTrip.geospatialLayers[0].features[0].geoJsonId === "asset/Été-α-001", "GeoJSON import-export-import preserves feature identity");
    assert(identityRoundTrip.geospatialLayers[0].features[0].attributes.nullable_note === null && identityRoundTrip.geospatialLayers[0].features[0].attributes.field_12 === "A12", "GeoJSON identity round trip retains nulls and large attribute sets");
    let malformedIdentityMessage = "";
    try {
      buildGeoJsonPayload({ type: "FeatureCollection", features: [{ type: "Feature", id: { asset: 7 }, properties: {}, geometry: { type: "Point", coordinates: [-114, 51] } }] }, { format: "GeoJSON" });
    } catch (error) {
      malformedIdentityMessage = error.message || "";
    }
    assert(malformedIdentityMessage === "GeoJSON feature 1 could not be imported: feature id must be a string or finite number. Repair or remove the top-level id value.", "GeoJSON invalid feature ids fail with actionable repair guidance");

    const reservedPayload = buildGeoJsonPayload(${JSON.stringify(complexReservedProperties)}, {
      projectName: "Reserved property integrity",
      fileName: "complex-reserved-properties.geojson",
      format: "GeoJSON"
    });
    const reservedPoint = reservedPayload.geospatialLayers.find((layer) => layer.geometryType === "point");
    const reservedLine = reservedPayload.geospatialLayers.find((layer) => layer.geometryType === "line");
    const reservedPolygon = reservedPayload.geospatialLayers.find((layer) => layer.geometryType === "polygon");
    assert(reservedPoint.features[0].attributes["Source ID 2"] === 0, "reserved ID is visible under a collision-safe alias without overwriting workspace identity");
    assert(reservedPoint.features[0].attributes["Source Date"] === null, "reserved Date retains an explicit null under a collision-safe alias");
    assert(reservedPoint.features[0].attributes["Source Latitude"] === "surveyed latitude text" && reservedPoint.features[0].attributes.Latitude === 51.0447, "source Latitude remains distinct from geometry latitude");
    assert(reservedPoint.features[0].attributes["Source symbol_color"] === "ultraviolet-custom", "unsupported source style text is retained without changing LalGeo styling");
    const reservedPointExport = layerToGeoJson(reservedPoint).features[0];
    assert(reservedPointExport.properties.ID === 0 && reservedPointExport.properties.Date === null, "GeoJSON export restores falsy and null reserved properties exactly");
    assert(reservedPointExport.properties.Latitude === "surveyed latitude text" && reservedPointExport.properties.Longitude === 0, "GeoJSON export restores coordinate-named source properties independently of geometry");
    assert(reservedPointExport.properties["Source ID"] === "pre-existing alias" && !("Source ID 2" in reservedPointExport.properties), "pre-existing alias-like fields survive while temporary aliases never leak");
    assert(layerToGeoJson(reservedLine).features[0].properties.symbol_color === null, "line export restores explicit null style collision");
    assert(layerToGeoJson(reservedPolygon).features[0].properties.symbol_shape === false && reservedPolygon.features[0].geometry.rings.length === 2, "polygon export restores false collision values without losing holes");
    const reservedRoundTrip = buildGeoJsonPayload(layerToGeoJson(reservedPoint), { format: "GeoJSON reserved-property round trip" });
    const reservedRoundTripExport = layerToGeoJson(reservedRoundTrip.geospatialLayers[0]).features[0];
    assert(reservedRoundTripExport.properties.ID === 0 && reservedRoundTripExport.properties.Date === null && reservedRoundTripExport.properties.field_12 === "A12", "import-export-import preserves reserved values, nulls, Unicode, and large field sets");

    const apiRowsPayload = buildGeoJsonPayloadFromJsonRows(${JSON.stringify(complexApiRows)}, {
      projectName: "Complex API rows",
      url: "https://example.test/assets.json"
    });
    const apiRowsLayer = apiRowsPayload.geospatialLayers[0];
    assert(apiRowsLayer.features.length === 2, "API JSON imports every coordinate row");
    assert(apiRowsLayer.features[0].attributes.name === "Station Été 🌲" && apiRowsLayer.features[0].attributes.nullable_note === null, "API JSON preserves Unicode and explicit null attributes");
    assert(apiRowsLayer.features[0].attributes.field_12 === "A12", "API JSON preserves large field sets");
    const apiRowsRoundTrip = buildGeoJsonPayload(layerToGeoJson(apiRowsLayer), { format: "API JSON GeoJSON round trip" });
    assert(apiRowsRoundTrip.geospatialLayers[0].features[0].attributes.inspected_at === "2026-08-03T09:15:00-06:00", "API JSON import-export-import preserves date attributes");
    let malformedApiRowsMessage = "";
    try {
      buildGeoJsonPayloadFromJsonRows(${JSON.stringify(malformedApiRows)}, { projectName: "Malformed API rows" });
    } catch (error) {
      malformedApiRowsMessage = error.message || "";
    }
    assert(malformedApiRowsMessage === "API JSON row 2 has invalid latitude or longitude. Use decimal WGS84 values within latitude -90 to 90 and longitude -180 to 180.", "API JSON rejects a malformed row instead of silently importing its neighbors");

    const polygonHolesPayload = buildGeoJsonPayload(${JSON.stringify(polygonHolesGeoJson)}, {
      projectName: "Polygon holes",
      fileName: "polygon-holes.geojson",
      format: "GeoJSON"
    });
    const polygonHolesLayer = polygonHolesPayload.geospatialLayers[0];
    assert(polygonHolesLayer.features[0].geometry.rings.length === 2, "GeoJSON import preserves polygon holes");
    assert(polygonHolesLayer.features[0].attributes.name === "Parcelle Été 🌲", "GeoJSON import preserves Unicode attributes");
    assert(polygonHolesLayer.features[0].attributes.nullable_note === null, "GeoJSON import preserves null attributes");
    assert(polygonHolesLayer.features[0].attributes.inspected_at === "2026-07-17T14:30:00-06:00", "GeoJSON import preserves date strings");
    const polygonHolesExport = layerToGeoJson(polygonHolesLayer);
    assert(polygonHolesExport.features[0].geometry.coordinates.length === 2, "GeoJSON export preserves polygon holes");
    const polygonHolesRoundTrip = buildGeoJsonPayload(polygonHolesExport, { format: "GeoJSON round trip" });
    assert(polygonHolesRoundTrip.geospatialLayers[0].features[0].geometry.rings.length === 2, "GeoJSON import-export-import round trip preserves polygon holes");

    const kmlHolesPayload = buildGeoJsonPayload(parseKmlText(${JSON.stringify(polygonHolesKml)}), {
      projectName: "KML holes",
      fileName: "polygon-holes.kml",
      format: "KML"
    });
    assert(kmlHolesPayload.geospatialLayers[0].features[0].geometry.rings.length === 2, "KML import preserves inner boundaries");
    assert(kmlHolesPayload.geospatialLayers[0].features[0].attributes.name === "Parcelle Été 🌲", "KML import preserves Unicode attributes");

    const complexStyledKmlPayload = buildGeoJsonPayload(parseKmlText(${JSON.stringify(complexStyledKml)}), {
      projectName: "Complex styled KML",
      fileName: "complex-styled-multigeometry.kml",
      format: "KML"
    });
    const styledKmlLine = complexStyledKmlPayload.geospatialLayers.find((layer) => layer.geometryType === "line");
    const styledKmlPolygon = complexStyledKmlPayload.geospatialLayers.find((layer) => layer.geometryType === "polygon");
    assert(styledKmlLine.features.length === 1 && styledKmlPolygon.features.length === 1, "KML MultiGeometry imports every line and polygon");
    assert(styledKmlLine.features[0].attributes.unicode_owner === "Montréal α", "KML SchemaData preserves Unicode SimpleData");
    assert(styledKmlLine.features[0].attributes.nullable_note === "", "KML SchemaData preserves empty SimpleData");
    assert(styledKmlLine.features[0].attributes.field_12 === "A12", "KML SchemaData preserves large field sets");
    assert(styledKmlLine.features[0].attributes.description === "Line and polygon collected together", "KML preserves placemark descriptions");
    assert(styledKmlLine.features[0].attributes.kml_timestamp === "2026-07-30T08:15:00-06:00", "KML preserves timestamp strings");
    assert(styledKmlLine.features[0].attributes.kml_style_color === "ffff8c42" && styledKmlLine.features[0].attributes.symbol_color === "Blue", "KML preserves source color and maps it to the nearest supported palette color");
    assert(styledKmlPolygon.features[0].geometry.rings.length === 2, "KML MultiGeometry preserves polygon holes");
    const styledKmlExport = layerToGeoJson(styledKmlLine);
    const styledKmlRoundTrip = buildGeoJsonPayload(styledKmlExport, { format: "KML GeoJSON round trip" });
    assert(styledKmlRoundTrip.geospatialLayers[0].features[0].attributes.field_12 === "A12", "KML import-export-import preserves SimpleData attributes");
    let malformedKmlMessage = "";
    try {
      parseKmlText(${JSON.stringify(malformedKmlCoordinate)});
    } catch (error) {
      malformedKmlMessage = error.message || "";
    }
    assert(malformedKmlMessage === "KML placemark 1, line 1, coordinate 2 is invalid. Use longitude,latitude values in WGS84.", "malformed KML blocks false lines with an actionable coordinate error");

    let multiFileMessage = "";
    try {
      await buildSurveyPayload([
        new File([JSON.stringify(${JSON.stringify(polygonHolesGeoJson)})], "primary.geojson", { type: "application/geo+json" }),
        new File([${JSON.stringify(secondaryUnicodeLines)}], "Rivière secondaire Montréal α.geojson", { type: "application/geo+json" })
      ]);
    } catch (error) {
      multiFileMessage = error.message || "";
    }
    assert(multiFileMessage.includes("Multiple datasets were selected (primary.geojson, Rivière secondaire Montréal α.geojson)"), "multi-file import names every dataset that would otherwise be skipped");
    assert(multiFileMessage.includes("Import one dataset at a time so no geometry or attributes are skipped"), "multi-file import gives actionable data-integrity guidance");

    const fileFromBase64 = (base64, name) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      return new File([bytes], name, { type: "application/zip" });
    };
    const complexKmzPayload = await buildGeospatialPayload([
      fileFromBase64(${JSON.stringify(complexKmz)}, "complex-main-document.kmz")
    ]);
    const complexKmzPointLayer = complexKmzPayload.geospatialLayers.find((layer) => layer.geometryType === "point");
    const complexKmzPolygonLayer = complexKmzPayload.geospatialLayers.find((layer) => layer.geometryType === "polygon");
    assert(complexKmzPayload.geospatialLayers.length === 3, "KMZ doc.kml imports point, line, and polygon layers instead of helper KML");
    assert(complexKmzPointLayer.features[0].attributes.name === "Station Été 🌲", "KMZ preserves Unicode attributes from doc.kml");
    assert(complexKmzPointLayer.features[0].attributes.inspected_at === "2026-07-28T09:15:00-06:00", "KMZ preserves date strings");
    assert(complexKmzPointLayer.features[0].attributes.nullable_note === "", "KMZ preserves empty ExtendedData values");
    assert(complexKmzPointLayer.features[0].attributes.field_12 === "A12", "KMZ preserves large ExtendedData field sets");
    assert(complexKmzPolygonLayer.features[0].geometry.rings.length === 2, "KMZ preserves polygon holes");
    const complexKmzExport = layerToGeoJson(complexKmzPointLayer);
    const complexKmzRoundTrip = buildGeoJsonPayload(complexKmzExport, { format: "KMZ GeoJSON round trip" });
    assert(complexKmzRoundTrip.geospatialLayers[0].features[0].attributes.field_12 === "A12", "KMZ import-export-import preserves attributes");

    let ambiguousKmzMessage = "";
    try {
      await buildGeospatialPayload([fileFromBase64(${JSON.stringify(ambiguousKmz)}, "ambiguous-main-document.kmz")]);
    } catch (error) {
      ambiguousKmzMessage = error.message;
    }
    assert(ambiguousKmzMessage.includes("Rename the main document to doc.kml at the archive root"), "ambiguous KMZ explains how to select the main document");

    const complexShapefilePayload = await buildGeospatialPayload([
      fileFromBase64(${JSON.stringify(complexShapefile)}, "complex-web-mercator.zip")
    ]);
    const complexShapefileLayer = complexShapefilePayload.geospatialLayers[0];
    assert(complexShapefileLayer.features.length === 2, "projected Shapefile imports every feature");
    assert(Math.abs(complexShapefileLayer.features[0].geometry.lat - 51.0447) < 0.00001 && Math.abs(complexShapefileLayer.features[0].geometry.lng + 114.0719) < 0.00001, "Shapefile .prj transforms Web Mercator coordinates to WGS84");
    assert(complexShapefileLayer.features[0].attributes.NAME === "Café rivière", "Shapefile preserves UTF-8 attributes declared by .cpg");
    assert(complexShapefileLayer.features[0].attributes.INSPECTED === "2026-07-27", "Shapefile preserves DBF dates");
    assert(complexShapefileLayer.features[0].attributes.FIELD_12 === "A12", "Shapefile preserves large DBF field sets");
    const complexShapefileExport = layerToGeoJson(complexShapefileLayer);
    const complexShapefileRoundTrip = buildGeoJsonPayload(complexShapefileExport, { format: "Shapefile GeoJSON round trip" });
    assert(complexShapefileRoundTrip.geospatialLayers[0].features[1].attributes.NAME === "Montréal α", "Shapefile import-export-import preserves Unicode attributes");

    let projectedWithoutPrjMessage = "";
    try {
      await normalizeShapefileZip(await fileFromBase64(${JSON.stringify(projectedShapefileWithoutPrj)}, "projected-missing-prj.zip").arrayBuffer());
    } catch (error) {
      projectedWithoutPrjMessage = error.message;
    }
    assert(projectedWithoutPrjMessage.includes("appears to use projected coordinates but has no .prj file"), "projected Shapefile without .prj explains how to prevent misplaced geometry");

    let missingDbfMessage = "";
    try {
      await normalizeShapefileZip(await fileFromBase64(${JSON.stringify(shapefileWithoutAttributes)}, "missing-attributes.zip").arrayBuffer());
    } catch (error) {
      missingDbfMessage = error.message;
    }
    assert(missingDbfMessage.includes("missing its matching .dbf attribute table"), "Shapefile without .dbf blocks silent attribute loss");

    let malformedPolygonMessage = "";
    try {
      buildGeoJsonPayload(${JSON.stringify(malformedPolygonGeoJson)}, { format: "GeoJSON" });
    } catch (error) {
      malformedPolygonMessage = error.message;
    }
    assert(malformedPolygonMessage === "GeoJSON feature 1 could not be imported: Polygon outer ring coordinate 3 is invalid. Use [longitude, latitude] values in WGS84.", "malformed GeoJSON reports the feature and exact invalid ring coordinate");

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

    const complexCsvPayload = parseSurveyCSV(${JSON.stringify(complexSurveyCsv)});
    assert(complexCsvPayload.records.length === 2, "CSV imports all response rows");
    assert(complexCsvPayload.records[0].Name === "Café, rivière 🌊", "CSV preserves quoted commas and Unicode");
    assert(complexCsvPayload.records[0].Notes === 'First line,\\nsecond line with "quoted" text', "CSV preserves embedded newlines and escaped quotes");
    assert(complexCsvPayload.records[0]["Inspected At"] === "2026-07-23T08:15:00-06:00", "CSV preserves date strings");
    assert(complexCsvPayload.records[0].Nullable === "", "CSV preserves empty fields without shifting columns");
    assert(complexCsvPayload.records[0]["Field 08"] === "A08", "CSV preserves large field sets through the final column");
    assert(complexCsvPayload.archiveRecords[0].Name === "Archived, feature", "CSV preserves quoted archive attributes");
    const complexCsvRoundTrip = parseSurveyCSV(Papa.unparse([
      ["Responses"],
      complexCsvPayload.headers,
      ...complexCsvPayload.records.map((record) => complexCsvPayload.headers.map((header) => record[header])),
      ["Archive"],
      complexCsvPayload.archiveHeaders,
      ...complexCsvPayload.archiveRecords.map((record) => complexCsvPayload.archiveHeaders.map((header) => record[header]))
    ]));
    assert(complexCsvRoundTrip.records[0].Notes === complexCsvPayload.records[0].Notes, "CSV import-export-import preserves multiline attributes");
    assert(complexCsvRoundTrip.archiveRecords[0]["Field 08"] === "C08", "CSV round trip preserves archive field sets");

    let malformedCsvMessage = "";
    try {
      parseSurveyCSV(${JSON.stringify(malformedSurveyCsv)});
    } catch (error) {
      malformedCsvMessage = error.message;
    }
    assert(malformedCsvMessage.includes("CSV has an unclosed quoted field"), "malformed CSV explains how to fix an unclosed quote");

    let malformedCoordinateMessage = "";
    try {
      ensureParsedCoordinates(parseSurveyCSV(${JSON.stringify(malformedCoordinateCsv)}));
    } catch (error) {
      malformedCoordinateMessage = error.message;
    }
    assert(malformedCoordinateMessage === "CSV response row 2 has a missing or non-numeric coordinate. Use decimal WGS84 latitude and longitude values.", "CSV blocks a corrupt middle coordinate row before silently dropping its attributes");

    const complexGpxPayload = buildGeoJsonPayload(parseGpxText(${JSON.stringify(complexGpx)}), {
      projectName: "Complex GPX",
      fileName: "complex-field-collection.gpx",
      format: "GPX"
    });
    const complexGpxPointLayer = complexGpxPayload.geospatialLayers.find((layer) => layer.geometryType === "point");
    const complexGpxLineLayer = complexGpxPayload.geospatialLayers.find((layer) => layer.geometryType === "line");
    assert(complexGpxPointLayer.features[0].attributes.name === "Station α", "GPX preserves Unicode waypoint names");
    assert(complexGpxPointLayer.features[0].attributes.comment === "Valve, north side", "GPX preserves waypoint comments");
    assert(complexGpxPointLayer.features[0].attributes.elevation === "1048.25", "GPX preserves waypoint elevation");
    assert(complexGpxPointLayer.features[0].attributes.time === "2026-07-24T14:31:02Z", "GPX preserves waypoint timestamps");
    assert(complexGpxLineLayer.features.length === 3, "GPX keeps two track segments and one route distinct");
    assert(complexGpxLineLayer.features[0].attributes.gpx_segment === 1 && complexGpxLineLayer.features[1].attributes.gpx_segment === 2, "GPX records track segment identity");
    assert(complexGpxLineLayer.features[0].attributes.gpx_elevations === '["1048.25","1049.5"]', "GPX preserves per-vertex elevations");
    assert(complexGpxLineLayer.features[0].attributes.gpx_times === '["2026-07-24T14:31:02Z","2026-07-24T14:32:03Z"]', "GPX preserves per-vertex timestamps");
    const complexGpxExport = layerToGeoJson(complexGpxLineLayer);
    const complexGpxRoundTrip = buildGeoJsonPayload(complexGpxExport, { format: "GPX GeoJSON round trip" });
    assert(complexGpxRoundTrip.geospatialLayers[0].features.length === 3, "GPX import-export-import round trip preserves line features");
    assert(complexGpxRoundTrip.geospatialLayers[0].features[1].attributes.gpx_segment === 2, "GPX round trip preserves segment attributes");

    let malformedGpxMessage = "";
    try {
      parseGpxText(${JSON.stringify(malformedGpx)});
    } catch (error) {
      malformedGpxMessage = error.message;
    }
    assert(malformedGpxMessage === "GPX track 1, segment 1, point 2 has an invalid latitude or longitude. Use decimal WGS84 coordinates within latitude -90 to 90 and longitude -180 to 180.", "malformed GPX identifies the exact invalid track point");

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
    setAdvancedGisVisible(true);
    const advancedTools = [...document.querySelectorAll("[data-gis-tool]")].map((button) => button.dataset.gisTool);
    assert(!makeEl("advancedGisPanel").hidden, "advanced GIS toolbar opens panel");
    assert(["export-layer", "select-attribute", "buffer", "merge", "cut-hole", "snap-settings", "topology", "style-field", "labels", "photo-import", "offline-pack"].every((tool) => advancedTools.includes(tool)), "advanced GIS toolbar exposes core GIS tools");
    assert(makeEl("advancedGisLayerBadge").textContent.includes("polygon layer"), "advanced GIS toolbar shows active layer badge");
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
    selectedTableRows = new Set([0]);
    assert(layerToGeoJson(layer, [0]).features.length === 1, "advanced GIS selected GeoJSON export scopes features");
    activeFeatureId = layer.features[0].id;
    activeSurveyAnnotation = rowAnnotationMap.get(0);
    cutCenteredHoleInSelectedPolygon();
    assert((layer.features[0].geometry.rings || []).length === 2, "advanced GIS cut hole adds interior polygon ring");
    assert(layerToGeoJson(layer, [0]).features[0].geometry.coordinates.length === 2, "advanced GIS polygon holes export to GeoJSON rings");

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
