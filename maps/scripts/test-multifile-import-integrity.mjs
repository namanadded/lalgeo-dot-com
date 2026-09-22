import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const fixture = JSON.parse(readFileSync(new URL("../fixtures/interoperability/secondary-unicode-lines.geojson", import.meta.url), "utf8"));

const selectionMatch = source.match(/function assertUnambiguousImportSelection\(files\) \{[\s\S]*?^        \}/m);
assert.ok(selectionMatch, "multi-file selection validation is present");
const assertUnambiguousImportSelection = Function(`${selectionMatch[0]}; return assertUnambiguousImportSelection;`)();
const files = (...names) => names.map((name) => ({ name }));

assert.doesNotThrow(() => assertUnambiguousImportSelection(files("complex.geojson")));
assert.doesNotThrow(() => assertUnambiguousImportSelection(files("survey.csv", "survey.json", "photo.jpg")));
assert.doesNotThrow(() => assertUnambiguousImportSelection(files("Parcelles ÉTÉ.SHP", "Parcelles ÉTÉ.dbf", "Parcelles ÉTÉ.prj")));
assert.throws(
  () => assertUnambiguousImportSelection(files("primary.geojson", "Rivière secondaire Montréal α.geojson")),
  /Import one dataset at a time so no geometry or attributes are skipped/,
  "two GeoJSON datasets are rejected instead of silently dropping the second"
);
assert.throws(
  () => assertUnambiguousImportSelection(files("survey.csv", "track.gpx")),
  /Multiple datasets were selected \(survey\.csv, track\.gpx\)/,
  "mixed formats identify the ignored filenames and explain recovery"
);
assert.throws(
  () => assertUnambiguousImportSelection(files("one.zip", "two.zip")),
  /Import one dataset at a time/,
  "multiple packages are rejected before either package mutates the workspace"
);

assert.equal(fixture.features.length, 1);
assert.equal(fixture.features[0].geometry.type, "LineString");
assert.equal(fixture.features[0].properties.name, "Rivière secondaire Montréal α");
assert.equal(fixture.features[0].properties.nullable_note, null);
assert.equal(fixture.features[0].properties.field_12, "B12");
assert.match(source, /assertUnambiguousImportSelection\(files\);[\s\S]*?buildGeospatialPayload\(files\)/);
assert.match(source, /Multiple loose Shapefile datasets were selected/);

console.log("Multi-file import geometry and attribute integrity checks passed.");
