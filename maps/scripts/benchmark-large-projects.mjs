import { performance } from "node:perf_hooks";

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

function measure(project, space) {
  const startMemory = process.memoryUsage().heapUsed;
  const start = performance.now();
  const output = JSON.stringify(project, null, space);
  return {
    ms: performance.now() - start,
    bytes: Buffer.byteLength(output),
    heapDeltaMb: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
  };
}

console.log("features,source_mb,pretty_ms,compact_ms,pretty_mb,compact_mb,size_reduction_pct,compact_heap_delta_mb");
for (const [features, propertyBytes] of [[1_000, 128], [10_000, 256], [50_000, 512]]) {
  const project = syntheticProject(features, propertyBytes);
  const sourceMb = Buffer.byteLength(JSON.stringify(project)) / 1024 / 1024;
  const pretty = measure(project, 2);
  const compact = measure(project);
  const reduction = (1 - compact.bytes / pretty.bytes) * 100;
  console.log([features, sourceMb, pretty.ms, compact.ms, pretty.bytes / 1024 / 1024, compact.bytes / 1024 / 1024, reduction, compact.heapDeltaMb]
    .map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
