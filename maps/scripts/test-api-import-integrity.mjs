import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../public/legacy/lalgeosurvey.html", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const complexRows = JSON.parse(await readFile(new URL("../fixtures/interoperability/complex-api-rows.json", import.meta.url), "utf8"));
const malformedRows = JSON.parse(await readFile(new URL("../fixtures/interoperability/malformed-api-rows.json", import.meta.url), "utf8"));

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist.`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}.`);
}

const capturedPayloads = [];
const api = new Function(
  "buildGeoJsonPayload",
  "isGeoJsonObject",
  `${extractFunction("normalizeApiJsonRows")}
   ${extractFunction("findEmbeddedGeoJsonGeometry")}
   ${extractFunction("buildGeoJsonFromJsonRows")}
   ${extractFunction("findLatLonKeys")}
   ${extractFunction("parseNumber")}
   ${extractFunction("buildGeoJsonPayloadFromJsonRows")}
   return { normalizeApiJsonRows, buildGeoJsonFromJsonRows, buildGeoJsonPayloadFromJsonRows };`,
)(
  (collection, options) => {
    const payload = { geospatialLayers: [{ geometryType: "point", features: collection.features }], options };
    capturedPayloads.push(payload);
    return payload;
  },
  (value) => value && typeof value === "object" && [
    "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection",
  ].includes(value.type),
);

const payload = api.buildGeoJsonPayloadFromJsonRows(complexRows, {
  projectName: "Municipal assets 2026",
  url: "https://example.test/assets.json",
});
const features = payload.geospatialLayers[0].features;
assert.equal(features.length, 2, "Every valid API row should become one point feature.");
assert.deepEqual(features[0].geometry.coordinates, [-114.0719, 51.0447], "String coordinates should normalize to WGS84 numbers.");
assert.equal(features[0].properties.name, "Station Été 🌲", "Unicode attributes should survive API normalization.");
assert.equal(features[0].properties.inspected_at, "2026-08-03T09:15:00-06:00", "Date strings should remain unchanged.");
assert.equal(features[0].properties.nullable_note, null, "Explicit null attributes should remain null.");
assert.equal(features[0].properties.field_12, "A12", "Large field sets should retain their final field.");
assert.equal(payload.source.geometrySource, "latitude-longitude", "The live-layer source should record coordinate-field normalization.");

assert.throws(
  () => api.buildGeoJsonPayloadFromJsonRows(malformedRows, { projectName: "Malformed" }),
  /API JSON row 2 has invalid latitude or longitude\. Use decimal WGS84 values within latitude -90 to 90 and longitude -180 to 180\./,
  "One malformed API row must reject the response instead of silently importing its neighbors.",
);
assert.equal(capturedPayloads.length, 1, "Malformed rows must fail before any layer payload is built.");

const geometryRows = {
  records: [
    { name: "Réseau Montréal α", nullable_note: null, shape: { type: "LineString", coordinates: [[-73.59, 45.49], [-73.57, 45.51]] } },
    { name: "Parcelle Été", shape: { type: "Polygon", coordinates: [[[-114.1, 51.02], [-114.05, 51.02], [-114.05, 51.06], [-114.1, 51.02]]] } },
  ],
};
const geometryCollection = api.buildGeoJsonFromJsonRows(geometryRows);
assert.equal(geometryCollection.features.length, 2, "Every embedded-geometry row should be retained.");
assert.equal(geometryCollection.features[0].properties.nullable_note, null, "Embedded geometry should preserve null attributes.");
assert.equal("shape" in geometryCollection.features[0].properties, false, "Geometry should not be duplicated into attributes.");
assert.throws(
  () => api.buildGeoJsonFromJsonRows({ records: [geometryRows.records[0], { name: "Missing shape" }] }),
  /API JSON row 2 is missing GeoJSON geometry\. Add a Point, LineString, Polygon, or multipart geometry to every row\./,
  "A missing embedded geometry must not silently remove its row.",
);

const socrata = api.normalizeApiJsonRows({
  meta: { view: { columns: [{ fieldName: "name" }, { fieldName: "nullable_note" }, { fieldName: "missing_value" }] } },
  data: [["Café rivière", null]],
});
assert.deepEqual(
  socrata[0],
  { name: "Café rivière", nullable_note: null, missing_value: "" },
  "Socrata normalization should distinguish explicit nulls from absent cells.",
);

console.log("API row geometry and attribute integrity checks passed.");
