import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadLalGeoProjectContract } from "./lib/lalgeo-project-contract.mjs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const complex = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-lalgeo-project.lal", import.meta.url), "utf8"));
const malformed = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-lalgeo-project.lal", import.meta.url), "utf8"));

const contract = loadLalGeoProjectContract(source);

const imported = contract.validateLalGeoProject(complex.project, { fileName: "complex-lalgeo-project.lal" });
assert.equal(imported.layers.length, 3);
assert.equal(imported.activeLayerId, "assets");
assert.equal(imported.layers[0].features[0].attributes.Name, "Café rivière 🌊");
assert.equal(imported.layers[0].features[0].attributes.Nullable, null);
assert.equal(imported.layers[0].features[0].attributes.Field12, "A12");
assert.equal(imported.layers[0].styleDefaults.symbol_color, "Purple");
assert.equal(imported.layers[2].features[0].geometry.rings.length, 2);
assert(imported.layers[0].schema.some((field) => field.name === "Nullable"), "missing attributes must be added to schema");
assert(imported.layers[0].schema.some((field) => field.name === "Field12"), "large field sets must be added to schema");
assert.notEqual(imported, complex.project, "validation must clone before normalization");

assert.throws(
  () => contract.validateLalGeoProject(malformed.project, { fileName: "malformed-lalgeo-project.lal" }),
  /LalGeo layer 1 \(Bad coordinates\), feature 1 has an invalid coordinate.*latitude -90 to 90/
);

assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(feature\.attributes \|\| \{\}, field\.name\)/);
assert.match(source, /ZIP contains multiple LalGeo project files/);
assert.match(source, /is not valid JSON\. Re-export it from LalGeo/);
assert.match(source, /const zipFile = files\.find\(\(file\) => \/\\\.zip\$\/i\.test\(file\.name \|\| ""\)\)/);

console.log("LalGeo project integrity regression checks passed.");
