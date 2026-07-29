import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { normalizeLalDocument } = await importModule("../../js/lal-file.js");

const input = {
  kind: "lal-layer",
  version: 2,
  metadata: { name: "Detached import", featureCount: 99, extension: { source: "synthetic" } },
  schema: [{ name: "notes", type: "text", options: ["a", "b"] }],
  style: { symbolColor: "Blue", custom: { opacity: 0.5 } },
  features: [{
    id: "feature-1",
    geometry: { type: "Polygon", coordinates: [[[-114, 51], [-113, 51], [-114, 51]]] },
    properties: { notes: "original", nested: { retained: true } },
  }],
  revision: { dropboxRev: "rev-1", sourcePath: "/safe/test.lal", lastSyncedAt: "2026-07-29T00:00:00.000Z" },
  extension: { preserved: true },
};

const before = structuredClone(input);
const normalized = normalizeLalDocument(input, "detached.lal");

assert.deepEqual(input, before, "normalization must not mutate imported provider bytes");
assert.equal(normalized.metadata.featureCount, 1);
assert.equal(normalized.extension.preserved, true, "unknown top-level fields remain compatible");
assert.deepEqual(normalized.features, input.features, "feature values remain semantically identical");
assert.notEqual(normalized, input);
assert.notEqual(normalized.metadata, input.metadata);
assert.notEqual(normalized.schema, input.schema);
assert.notEqual(normalized.schema[0], input.schema[0]);
assert.notEqual(normalized.schema[0].options, input.schema[0].options);
assert.notEqual(normalized.features, input.features);
assert.notEqual(normalized.features[0], input.features[0]);
assert.notEqual(normalized.features[0].geometry, input.features[0].geometry);
assert.notEqual(normalized.features[0].geometry.coordinates, input.features[0].geometry.coordinates);
assert.notEqual(normalized.features[0].properties, input.features[0].properties);
assert.notEqual(normalized.features[0].properties.nested, input.features[0].properties.nested);

normalized.features[0].geometry.coordinates[0][0][0] = 0;
normalized.features[0].properties.notes = "changed";
normalized.features[0].properties.nested.retained = false;
normalized.schema[0].options.push("c");
assert.deepEqual(input, before, "editing normalized output must not change the parsed source document");

console.log("LalGeo import normalization: one-pass detached canonical document passed.");
