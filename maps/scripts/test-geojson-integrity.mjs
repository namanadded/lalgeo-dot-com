import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const complex = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-geometry-collection.geojson", import.meta.url), "utf8"));
const malformed = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-geometry-collection.geojson", import.meta.url), "utf8"));
const identifiers = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-feature-identifiers.geojson", import.meta.url), "utf8"));

assert.equal(complex.features[0].geometry.type, "GeometryCollection");
assert.deepEqual(complex.features[0].geometry.geometries.map(({ type }) => type), ["MultiPoint", "MultiLineString", "MultiPolygon"]);
assert.equal(complex.features[0].properties.nullable_note, null);
assert.equal(complex.features[0].properties.field_12, "A12");
assert.equal(complex.features[0].geometry.geometries[2].coordinates[0].length, 2);
assert.equal(malformed.features[0].geometry.geometries[0].coordinates[1][0], 500);
assert.deepEqual(identifiers.features.map(({ id }) => id), ["asset/Été-α-001", 0, 9007199254740991]);
assert.equal(identifiers.features[0].properties.nullable_note, null);
assert.equal(identifiers.features[0].properties.field_12, "A12");
assert.equal(identifiers.features[1].geometry.type, "MultiLineString");
assert.equal(identifiers.features[2].geometry.coordinates.length, 2);

function extractFunction(name) {
  const start = source.indexOf(`        function ${name}(`);
  assert.ok(start >= 0, `${name} is present`);
  let depth = 0;
  let bodyStarted = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
      bodyStarted = true;
    } else if (source[index] === "}") {
      depth -= 1;
      if (bodyStarted && depth === 0) return source.slice(start, index + 1).trim();
    }
  }
  throw new Error(`${name} is incomplete`);
}

const identityHelpers = new Function(`${extractFunction("readGeoJsonFeatureId")}\n${extractFunction("getGeoJsonExportId")}\nreturn { readGeoJsonFeatureId, getGeoJsonExportId };`)();
assert.equal(identityHelpers.readGeoJsonFeatureId(identifiers.features[0]), "asset/Été-α-001");
assert.equal(identityHelpers.readGeoJsonFeatureId(identifiers.features[1]), 0, "numeric zero is a valid GeoJSON feature id");
assert.equal(identityHelpers.readGeoJsonFeatureId({ type: "Feature" }), undefined);
assert.throws(() => identityHelpers.readGeoJsonFeatureId({ id: null }), /feature id must be a string or finite number/);
assert.throws(() => identityHelpers.readGeoJsonFeatureId({ id: { source: "asset" } }), /Repair or remove the top-level id value/);
assert.equal(identityHelpers.getGeoJsonExportId({ id: "lalgeo-internal", geoJsonId: 0 }), 0);
assert.equal(identityHelpers.getGeoJsonExportId({ id: "lalgeo-internal" }), "lalgeo-internal");

assert.match(source, /function readGeoJsonVertex\(pair, coordinateLabel/);
assert.match(source, /typeof pair\[0\] !== "number" \|\| typeof pair\[1\] !== "number"/);
assert.match(source, /vertex\.lat < -90 \|\| vertex\.lat > 90 \|\| vertex\.lng < -180 \|\| vertex\.lng > 180/);
assert.match(source, /GeometryCollection member \$\{index \+ 1\}/);
assert.match(source, /MultiLineString part \$\{lineIndex \+ 1\} coordinate \$\{coordinateIndex \+ 1\}/);
assert.doesNotMatch(source, /map\(coordinatePairToVertex\)\.filter\(Boolean\)/);
assert.match(source, /geoJsonId !== undefined \? \{ geoJsonId \} : \{\}/);

console.log("GeoJSON coordinate, collection, multipart, and feature identity integrity checks passed.");
