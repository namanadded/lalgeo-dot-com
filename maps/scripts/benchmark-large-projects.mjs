import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { persistJsonAtomically } = require("../public/js/workspace-persistence.js");

function syntheticProject(featureCount, propertyBytes) {
  const padding = "x".repeat(propertyBytes);
  return {
    kind: "lal-layer",
    version: 2,
    metadata: { name: `Synthetic ${featureCount}`, featureCount },
    schema: [{ name: "notes", type: "text" }],
    features: Array.from({ length: featureCount }, (_, index) => ({
      id: `synthetic-${index}`,
      geometry: { type: "Point", coordinates: [-114 + (index % 1000) / 1000, 51 + (index % 500) / 1000] },
      properties: { notes: padding, ordinal: index },
    })),
  };
}

function measureSerialization(project, space) {
  const startMemory = process.memoryUsage().heapUsed;
  const start = performance.now();
  const output = JSON.stringify(project, null, space);
  return {
    ms: performance.now() - start,
    bytes: Buffer.byteLength(output),
    heapDeltaMb: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
  };
}

function measureOperation(operation) {
  const startMemory = process.memoryUsage().heapUsed;
  const start = performance.now();
  const result = operation();
  return { result, ms: performance.now() - start, heapDeltaMb: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024 };
}

function simulateViewportWork(project) {
  let visible = 0;
  for (const feature of project.features) {
    const [lng, lat] = feature.geometry.coordinates;
    if (lng >= -113.75 && lng <= -113.25 && lat >= 51.1 && lat <= 51.4) visible += 1;
  }
  return visible;
}

console.log("features,source_mb,startup_parse_ms,import_clone_ms,pan_zoom_scan_ms,render_projection_ms,autosave_ms,export_ms,recovery_parse_ms,compact_heap_delta_mb,quota_previous_preserved");
for (const [features, propertyBytes] of [[1_000, 128], [10_000, 256], [50_000, 512]]) {
  const project = syntheticProject(features, propertyBytes);
  const compact = measureSerialization(project);
  const serialized = JSON.stringify(project);
  const startup = measureOperation(() => JSON.parse(serialized));
  const imported = measureOperation(() => structuredClone(project));
  const panZoom = measureOperation(() => simulateViewportWork(project));
  const rendered = measureOperation(() => project.features.map((feature) => feature.geometry.coordinates[0] + feature.geometry.coordinates[1]));
  const memoryStorage = new Map();
  const autosave = measureOperation(() => persistJsonAtomically({ setItem: (key, value) => memoryStorage.set(key, value) }, "project", project));
  const exported = measureSerialization(project, 2);
  const recovery = measureOperation(() => JSON.parse(memoryStorage.get("project")));
  const prior = "last-known-good";
  const quotaStorage = { value: prior, setItem() { throw new DOMException("quota", "QuotaExceededError"); } };
  const quotaResult = persistJsonAtomically(quotaStorage, "project", project);
  console.log([features, compact.bytes / 1024 / 1024, startup.ms, imported.ms, panZoom.ms, rendered.ms, autosave.ms, exported.ms, recovery.ms, compact.heapDeltaMb, !quotaResult.ok && quotaStorage.value === prior]
    .map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
