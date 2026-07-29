import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

if (typeof global.gc !== "function") {
  throw new Error("Run this benchmark with --expose-gc.");
}

const source = await readFile(new URL("../../js/lal-file.js", import.meta.url), "utf8");
const moduleSource = source.replaceAll(/^export /gm, "");
const url = `data:text/javascript;base64,${Buffer.from(`${moduleSource}\nexport { serializeLalDocument };`).toString("base64")}`;
const { serializeLalDocument } = await import(url);

function syntheticProject(featureCount, propertyBytes) {
  const padding = "x".repeat(propertyBytes);
  return {
    kind: "lal-layer",
    version: 2,
    metadata: {
      id: "safe-synthetic",
      name: `Synthetic ${featureCount}`,
      description: "",
      documentType: "layer",
      geometryType: "Point",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdBy: "benchmark",
      lastModifiedBy: "benchmark",
      featureCount,
      sourceFormat: "lal",
      projectStorageMode: "reference",
    },
    schema: [{ name: "notes", type: "text", nullable: true, description: "", options: [], locked: false }],
    style: { symbolColor: "Red", symbolShape: "Dot" },
    features: Array.from({ length: featureCount }, (_, index) => ({
      id: `synthetic-${index}`,
      geometry: { type: "Point", coordinates: [-114 + (index % 1000) / 1000, 51 + (index % 500) / 1000] },
      properties: { notes: padding, ordinal: index },
    })),
    revision: { dropboxRev: null, sourcePath: null, lastSyncedAt: null },
  };
}

function measure(operation) {
  global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const output = operation();
  return {
    output,
    elapsedMs: performance.now() - startedAt,
    heapDeltaMb: (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024,
  };
}

console.log("features,output_mb,legacy_ms,result_ms,legacy_heap_mb,result_heap_mb,heap_reduction_pct,equivalent");
for (const [featureCount, propertyBytes] of [[1_000, 128], [10_000, 256], [50_000, 512], [100_000, 768]]) {
  const project = syntheticProject(featureCount, propertyBytes);
  const legacy = measure(() => {
    const clone = JSON.parse(JSON.stringify(project));
    clone.metadata.featureCount = clone.features.length;
    clone.metadata.updatedAt = "benchmark";
    return JSON.stringify(clone);
  });
  const result = measure(() => serializeLalDocument(project, { pretty: false }));
  const legacyParsed = JSON.parse(legacy.output);
  const resultParsed = JSON.parse(result.output);
  delete legacyParsed.metadata.updatedAt;
  delete resultParsed.metadata.updatedAt;
  const equivalent = JSON.stringify(legacyParsed) === JSON.stringify(resultParsed);
  const reduction = 100 * (legacy.heapDeltaMb - result.heapDeltaMb) / legacy.heapDeltaMb;
  if (!equivalent || reduction < 30) {
    throw new Error(`Serialization regression at ${featureCount} features: equivalent=${equivalent}, heap reduction=${reduction.toFixed(2)}%`);
  }
  console.log([
    featureCount,
    Buffer.byteLength(result.output) / 1024 / 1024,
    legacy.elapsedMs,
    result.elapsedMs,
    legacy.heapDeltaMb,
    result.heapDeltaMb,
    reduction,
    equivalent,
  ].map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
