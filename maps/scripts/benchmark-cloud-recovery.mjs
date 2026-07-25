import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { uploadBlobResumably } = await importModule("../../js/cloud-storage.js");

console.log("payload_mb,chunk_mb,recovery_budget,append_calls,lookup_calls,elapsed_ms,bounded");
for (const sizeMb of [24, 48, 96]) {
  const blob = new Blob([new Uint8Array(sizeMb * 1024 * 1024)]);
  let appendCalls = 0;
  let lookupCalls = 0;
  const startedAt = performance.now();
  await assert.rejects(
    uploadBlobResumably({
      async start() { return { sessionId: `stalled-${sizeMb}` }; },
      async append() {
        appendCalls += 1;
        const error = new Error("synthetic partial outage");
        error.status = 503;
        throw error;
      },
      async finish() { throw new Error("finish should not be reached"); },
      async lookupOffset() {
        lookupCalls += 1;
        return 8 * 1024 * 1024;
      },
    }, blob, {
      chunkSize: 8 * 1024 * 1024,
      maxNoProgressRecoveries: 4,
      baseDelayMs: 0,
      sleep: async () => {},
      provider: "synthetic",
    }),
    (error) => error.code === "unavailable" && error.details.attempts === 4,
  );
  const elapsed = performance.now() - startedAt;
  assert.equal(appendCalls, 4);
  assert.equal(lookupCalls, 4);
  console.log([sizeMb, 8, 4, appendCalls, lookupCalls, elapsed, true]
    .map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
