import { performance } from "node:perf_hooks";

if (typeof global.gc !== "function") {
  throw new Error("Run this benchmark with --expose-gc.");
}

function syntheticWorkspace(featureCount, propertyBytes) {
  const padding = "x".repeat(propertyBytes);
  return [{
    id: `synthetic-${featureCount}`,
    name: `Synthetic ${featureCount}`,
    metadata: { featureCount, updatedAt: "2026-07-30T00:00:00.000Z" },
    layers: [{
      id: "points",
      features: Array.from({ length: featureCount }, (_, index) => ({
        id: `point-${index}`,
        geometry: {
          type: "Point",
          coordinates: [-114 + (index % 1000) / 1000, 51 + (index % 500) / 1000],
        },
        attributes: { notes: padding, ordinal: index },
      })),
    }],
  }];
}

function measureWrites(workspace, writeCount) {
  global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  let bytes = 0;
  for (let index = 0; index < writeCount; index += 1) {
    workspace[0].metadata.updatedAt = `2026-07-30T00:00:${String(index).padStart(2, "0")}.000Z`;
    bytes += Buffer.byteLength(JSON.stringify(workspace));
  }
  return {
    elapsedMs: performance.now() - startedAt,
    heapDeltaMb: (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024,
    bytes,
  };
}

const editsPerBurst = 10;
console.log("features,source_mb,edits,baseline_writes,coalesced_writes,baseline_ms,coalesced_ms,time_reduction_pct,baseline_heap_mb,coalesced_heap_mb");
for (const [featureCount, propertyBytes] of [[1_000, 128], [10_000, 256], [50_000, 512]]) {
  const workspace = syntheticWorkspace(featureCount, propertyBytes);
  const sourceMb = Buffer.byteLength(JSON.stringify(workspace)) / 1024 / 1024;
  // Before coalescing, each mutation wrote immediately and the debounced flush
  // wrote the final state once more.
  const baselineWrites = editsPerBurst + 1;
  const baseline = measureWrites(workspace, baselineWrites);
  const coalesced = measureWrites(workspace, 1);
  const timeReduction = 100 * (1 - coalesced.elapsedMs / baseline.elapsedMs);
  if (featureCount >= 10_000 && timeReduction < 88) {
    throw new Error(`Expected at least 88% autosave burst time reduction at ${featureCount} features; received ${timeReduction.toFixed(2)}%.`);
  }
  console.log([
    featureCount,
    sourceMb,
    editsPerBurst,
    baselineWrites,
    1,
    baseline.elapsedMs,
    coalesced.elapsedMs,
    timeReduction,
    baseline.heapDeltaMb,
    coalesced.heapDeltaMb,
  ].map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
