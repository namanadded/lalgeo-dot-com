import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mapsRoot = path.resolve(here, "..");
const source = fs.readFileSync(path.join(mapsRoot, "public/legacy/lalgeosurvey.html"), "utf8");
const malformed = fs.readFileSync(path.join(mapsRoot, "fixtures/interoperability/malformed-coordinate-row.csv"), "utf8");

assert.match(source, /if \(!parsed && csvParseError\) \{\s*throw csvParseError;\s*\} else if \(!parsed && parsedFromDoc\)/, "A corrupt CSV must not silently fall back to a different survey document");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const signatureEnd = source.indexOf(") {", start);
  const brace = source.indexOf("{", signatureEnd);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const context = { console };
vm.createContext(context);
vm.runInContext([
  extractFunction("normalizeHeaderName"),
  extractFunction("parseNumber"),
  extractFunction("findLatLonKeys"),
  extractFunction("collectValidCoords"),
  extractFunction("assertParsedCoordinateRows"),
  extractFunction("ensureParsedCoordinates"),
  "this.ensureParsedCoordinates = ensureParsedCoordinates;"
].join("\n"), context);

const records = malformed.trim().split("\n").slice(4).map((line) => {
  const values = line.split(",");
  return { ID: values[0], Latitude: values[1], Longitude: values[2], Name: values[3], "Field 12": values[19] };
});
const parsed = { headers: ["ID", "Latitude", "Longitude", "Name", "Field 12"], records, archiveRecords: [] };

assert.throws(
  () => context.ensureParsedCoordinates(parsed),
  /CSV response row 2 has a missing or non-numeric coordinate\. Use decimal WGS84 latitude and longitude values\./
);
assert.equal(records[0].Name, "Café rivière 🌊");
assert.equal(records[2].Name, "普通话");

const outOfBounds = {
  headers: ["Latitude", "Longitude"],
  records: [{ Latitude: "51", Longitude: "-114" }, { Latitude: "91", Longitude: "0" }],
  archiveRecords: []
};
assert.throws(() => context.ensureParsedCoordinates(outOfBounds), /CSV response row 2 is outside WGS84 bounds/);

const valid = {
  headers: ["Latitude", "Longitude", "Nullable", "Field 12"],
  records: [{ Latitude: "51.0447", Longitude: "-114.0719", Nullable: "", "Field 12": "A12" }],
  archiveRecords: [{ Latitude: "45.5019", Longitude: "-73.5673", Nullable: "", "Field 12": "Z12" }]
};
assert.equal(context.ensureParsedCoordinates(valid).records[0]["Field 12"], "A12");

console.log("CSV coordinate completeness and WGS84 integrity checks passed.");
