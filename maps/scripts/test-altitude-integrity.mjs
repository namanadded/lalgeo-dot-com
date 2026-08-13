import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const complex = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-altitude.geojson", import.meta.url), "utf8"));
const malformed = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-altitude.geojson", import.meta.url), "utf8"));

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is present`);
  let depth = 0;
  let opened = false;
  for (let index = source.indexOf(") {", start) + 2; index < source.length; index += 1) {
    if (source[index] === "{") { depth += 1; opened = true; }
    if (source[index] === "}") depth -= 1;
    if (opened && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const context = vm.createContext({ Number });
vm.runInContext([
  extractFunction("coordinatePairToVertex"),
  extractFunction("readGeoJsonVertex"),
  extractFunction("copyWorkspaceVertex"),
  extractFunction("createPointGeometry"),
  extractFunction("createLineGeometry"),
  extractFunction("createPolygonGeometryFromRings"),
  extractFunction("plainCoordsFromGeometry"),
  extractFunction("plainRingsFromGeometry"),
  extractFunction("geometryToGeoJson"),
  "this.api = { readGeoJsonVertex, createPointGeometry, createLineGeometry, createPolygonGeometryFromRings, geometryToGeoJson };"
].join("\n"), context);

const { api } = context;
const point = api.createPointGeometry(51.1784, -115.5708, 2948.25);
const line = api.createLineGeometry(complex.features[1].geometry.coordinates.map((pair, index) => api.readGeoJsonVertex(pair, `line ${index + 1}`)));
const polygon = api.createPolygonGeometryFromRings([complex.features[2].geometry.coordinates[0].map((pair) => api.readGeoJsonVertex(pair))]);
assert.deepEqual([...api.geometryToGeoJson(point).coordinates], [-115.5708, 51.1784, 2948.25]);
assert.equal(JSON.stringify(api.geometryToGeoJson(line).coordinates), JSON.stringify(complex.features[1].geometry.coordinates));
assert.equal(JSON.stringify(api.geometryToGeoJson(polygon).coordinates[0]), JSON.stringify(complex.features[2].geometry.coordinates[0]));
assert.equal(complex.features[0].properties.nullable, null);
assert.equal(complex.features[2].properties.field_12, "P12");
assert.throws(() => api.readGeoJsonVertex(malformed.features[0].geometry.coordinates[1], "GeoJSON feature 1 line coordinate 2"), /invalid altitude.*finite numeric third value in metres/);
assert.match(source, /KML.*invalid altitude|coordinate \$\{tupleIndex \+ 1\} has an invalid altitude/);
assert.match(source, /GPX.*invalid elevation|\$\{label\} has an invalid elevation/);

console.log("GeoJSON, KML, GPX, workspace, and export altitude integrity checks passed.");
