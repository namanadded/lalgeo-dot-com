import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const complex = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-geometry-collection.geojson", import.meta.url), "utf8"));
const malformed = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-geometry-collection.geojson", import.meta.url), "utf8"));

assert.equal(complex.features[0].geometry.type, "GeometryCollection");
assert.deepEqual(complex.features[0].geometry.geometries.map(({ type }) => type), ["MultiPoint", "MultiLineString", "MultiPolygon"]);
assert.equal(complex.features[0].properties.nullable_note, null);
assert.equal(complex.features[0].properties.field_12, "A12");
assert.equal(complex.features[0].geometry.geometries[2].coordinates[0].length, 2);
assert.equal(malformed.features[0].geometry.geometries[0].coordinates[1][0], 500);

assert.match(source, /function readGeoJsonVertex\(pair, coordinateLabel/);
assert.match(source, /typeof pair\[0\] !== "number" \|\| typeof pair\[1\] !== "number"/);
assert.match(source, /vertex\.lat < -90 \|\| vertex\.lat > 90 \|\| vertex\.lng < -180 \|\| vertex\.lng > 180/);
assert.match(source, /GeometryCollection member \$\{index \+ 1\}/);
assert.match(source, /MultiLineString part \$\{lineIndex \+ 1\} coordinate \$\{coordinateIndex \+ 1\}/);
assert.doesNotMatch(source, /map\(coordinatePairToVertex\)\.filter\(Boolean\)/);

console.log("GeoJSON coordinate, collection, and multipart integrity checks passed.");
