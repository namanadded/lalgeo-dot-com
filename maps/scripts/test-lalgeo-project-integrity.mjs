import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const complex = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-lalgeo-project.lal", import.meta.url), "utf8"));
const malformed = JSON.parse(readFileSync(new URL("../fixtures/interoperability/malformed-lalgeo-project.lal", import.meta.url), "utf8"));

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

let nextId = 0;
const context = vm.createContext({
  normalizeLayerGeometryType(value = "point") {
    const normalized = String(value || "point").trim().toLowerCase();
    if (normalized === "linestring" || normalized === "line") return "line";
    if (normalized === "polygon") return "polygon";
    return "point";
  },
  generateWorkspaceId(prefix) {
    nextId += 1;
    return `${prefix}-${nextId}`;
  },
  ensureLayerStructure(layer) {
    return layer;
  },
  stripExtension(name = "") {
    return name.replace(/\.[^/.]+$/, "");
  }
});
vm.runInContext(`${extractFunction("validateLalGeoProject")}; this.validateLalGeoProject = validateLalGeoProject;`, context);

const imported = context.validateLalGeoProject(complex.project, { fileName: "complex-lalgeo-project.lal" });
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
  () => context.validateLalGeoProject(malformed.project, { fileName: "malformed-lalgeo-project.lal" }),
  /LalGeo layer 1 \(Bad coordinates\), feature 1 has an invalid coordinate.*latitude -90 to 90/
);

assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(feature\.attributes \|\| \{\}, field\.name\)/);
assert.match(source, /ZIP contains multiple LalGeo project files/);
assert.match(source, /is not valid JSON\. Re-export it from LalGeo/);
assert.match(source, /const zipFile = files\.find\(\(file\) => \/\\\.zip\$\/i\.test\(file\.name \|\| ""\)\)/);

console.log("LalGeo project integrity regression checks passed.");
