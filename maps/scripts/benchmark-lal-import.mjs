import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

async function importModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { normalizeLalDocument } = await importModule("../../js/lal-file.js");

function syntheticProject(featureCount, propertyBytes) {
  const padding = "x".repeat(propertyBytes);
  return {
    kind: "lal-layer",
    version: 2,
    metadata: { name: `Synthetic ${featureCount}`, featureCount },
    schema: [{ name: "notes", type: "text", options: [] }],
    style: { symbolColor: "Red" },
    features: Array.from({ length: featureCount }, (_, index) => ({
      id: `synthetic-${index}`,
      geometry: { type: "Point", coordinates: [-114 + (index % 1000) / 1000, 51 + (index % 500) / 1000] },
      properties: { notes: padding, ordinal: index },
    })),
    revision: { dropboxRev: null, sourcePath: null, lastSyncedAt: null },
  };
}

function legacyNormalize(project) {
  const cloned = JSON.parse(JSON.stringify(project));
  cloned.features = cloned.features.map((feature) => ({
    id: feature.id,
    geometry: {
      type: feature.geometry.type,
      coordinates: JSON.parse(JSON.stringify(feature.geometry.coordinates)),
    },
    properties: { ...feature.properties },
  }));
  return cloned;
}

function measure(operation) {
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  const result = operation();
  const elapsed = performance.now() - started;
  const heap = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
  return { result, elapsed, heap };
}

console.log("features,source_mb,baseline_ms,result_ms,baseline_heap_mb,result_heap_mb,heap_reduction_pct,detached");
for (const [featureCount, propertyBytes] of [[1_000, 128], [10_000, 256], [50_000, 512], [100_000, 768]]) {
  const serialized = JSON.stringify(syntheticProject(featureCount, propertyBytes));
  const parsed = JSON.parse(serialized);
  const baseline = measure(() => legacyNormalize(parsed));
  const result = measure(() => normalizeLalDocument(parsed, "synthetic.lal"));
  const detached = result.result.features !== parsed.features
    && result.result.features[0] !== parsed.features[0]
    && result.result.features[0].geometry.coordinates !== parsed.features[0].geometry.coordinates;
  const reduction = baseline.heap > 0 ? (1 - (result.heap / baseline.heap)) * 100 : 0;
  if (featureCount >= 50_000) {
    assert.ok(reduction >= 50, `large import heap reduction regressed to ${reduction.toFixed(2)}%`);
  }
  assert.equal(detached, true, "normalized project must remain detached from provider bytes");
  console.log([
    featureCount,
    Buffer.byteLength(serialized) / 1024 / 1024,
    baseline.elapsed,
    result.elapsed,
    baseline.heap,
    result.heap,
    reduction,
    detached,
  ].map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
