import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { uploadBlobResumably } = await importModule("../../js/cloud-storage.js");
const timeoutMs = 10;

console.log("payload_mb,chunk_mb,deadline_ms,append_calls,lookup_calls,elapsed_ms,recovered");
for (const sizeMb of [16, 64, 256]) {
  const blob = new Blob([new Uint8Array(sizeMb * 1024 * 1024)]);
  let appendCalls = 0;
  let lookupCalls = 0;
  const startedAt = performance.now();
  const result = await uploadBlobResumably({
    async start() { return { sessionId: `deadline-${sizeMb}` }; },
    async append() {
      appendCalls += 1;
      if (appendCalls === 1) return new Promise(() => {});
    },
    async finish() { return { rev: `safe-rev-${sizeMb}` }; },
    async lookupOffset() {
      lookupCalls += 1;
      return 8 * 1024 * 1024;
    },
  }, blob, {
    chunkSize: 4 * 1024 * 1024,
    operationTimeoutMs: timeoutMs,
    attempts: 1,
    baseDelayMs: 0,
    sleep: async () => {},
    provider: "synthetic",
  });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.rev, `safe-rev-${sizeMb}`);
  assert.equal(appendCalls, (sizeMb / 4) - 2,
    "the timed-out chunk is accepted once and subsequent chunks continue from the reconciled cursor");
  assert.equal(lookupCalls, 1);
  assert.ok(elapsedMs < 1000, "a permanently pending provider request must settle within a bounded interval");
  console.log([sizeMb, 4, timeoutMs, appendCalls, lookupCalls, elapsedMs, true]
    .map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
