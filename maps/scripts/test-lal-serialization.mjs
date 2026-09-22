import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../js/lal-file.js", import.meta.url), "utf8");
const moduleSource = source.replaceAll(/^export /gm, "");
const url = `data:text/javascript;base64,${Buffer.from(`${moduleSource}\nexport { serializeLalDocument };`).toString("base64")}`;
const { serializeLalDocument } = await import(url);

const originalUpdatedAt = "2026-01-01T00:00:00.000Z";
const canonical = {
  kind: "lal-layer",
  version: 2,
  metadata: {
    id: "safe-synthetic",
    name: "Synthetic",
    description: "",
    documentType: "layer",
    geometryType: "Point",
    createdAt: originalUpdatedAt,
    updatedAt: originalUpdatedAt,
    createdBy: "test",
    lastModifiedBy: "test",
    featureCount: 999,
    sourceFormat: "lal",
    projectStorageMode: "reference",
  },
  schema: [{ name: "notes", type: "text", nullable: true, description: "", options: [], locked: false }],
  style: { symbolColor: "Red", symbolShape: "Dot" },
  features: [{
    id: "feature-1",
    geometry: { type: "Point", coordinates: [-114.07, 51.05] },
    properties: { notes: "synthetic only" },
  }],
  revision: { dropboxRev: null, sourcePath: null, lastSyncedAt: null },
};

const serialized = JSON.parse(serializeLalDocument(canonical, { pretty: false }));
assert.equal(serialized.metadata.featureCount, 1);
assert.notEqual(serialized.metadata.updatedAt, originalUpdatedAt);
assert.equal(canonical.metadata.featureCount, 999, "serialization must not mutate the live project");
assert.equal(canonical.metadata.updatedAt, originalUpdatedAt, "serialization must not dirty timestamps in memory");
assert.deepEqual(serialized.features, canonical.features, "canonical features must round-trip without data loss");

const incomplete = {
  kind: "lal-layer",
  version: 2,
  metadata: { name: "Needs normalization" },
  features: [{ geometry: { type: "Point", coordinates: [-114, 51] } }],
};
const normalized = JSON.parse(serializeLalDocument(incomplete, { pretty: false }));
assert.equal(normalized.features.length, 1);
assert.match(normalized.features[0].id, /^feature-/);
assert.deepEqual(normalized.features[0].properties, {});
assert.ok(Array.isArray(normalized.schema));
assert.ok(normalized.revision);

console.log("LAL serialization contract: low-memory canonical export and normalization fallback passed.");
