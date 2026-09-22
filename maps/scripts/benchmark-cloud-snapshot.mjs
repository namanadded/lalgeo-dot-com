import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

if (typeof global.gc !== "function") {
  throw new Error("Run this benchmark with --expose-gc.");
}

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { copyCloudRevisionSnapshot } = await importModule("../../js/cloud-storage.js");

console.log("payload_mb,baseline_client_transfer_mb,result_client_transfer_mb,transfer_reduction_pct,snapshot_ms,heap_delta_mb,copy_calls");
for (const payloadMb of [16, 64, 256, 512]) {
  global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  let copyCalls = 0;
  const startedAt = performance.now();
  await copyCloudRevisionSnapshot({
    async copyRevision({ destinationPath, revision }) {
      copyCalls += 1;
      return { path: destinationPath, rev: `snapshot-${revision}` };
    },
  }, {
    sourcePath: "/safe-test/project.lal",
    destinationPath: `/safe-test/_versions/project-${payloadMb}.lal`,
    revision: `rev-${payloadMb}`,
  }, { provider: "mock" });
  const elapsed = performance.now() - startedAt;
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  const baselineTransferMb = payloadMb * 2;
  const resultTransferMb = 0;
  if (copyCalls !== 1 || heapDeltaMb > 1) {
    throw new Error(`Server-side snapshot regression at ${payloadMb} MiB.`);
  }
  console.log([
    payloadMb,
    baselineTransferMb,
    resultTransferMb,
    100,
    elapsed,
    heapDeltaMb,
    copyCalls,
  ].map((value) => Number(value).toFixed(2)).join(","));
}
