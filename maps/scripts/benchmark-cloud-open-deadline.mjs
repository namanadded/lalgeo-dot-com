import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { downloadBlobVerified } = await importModule("../../js/cloud-storage.js");
const timeoutMs = 10;

console.log("payload_mb,deadline_ms,download_calls,verify_calls,elapsed_ms,recovered");
for (const sizeMb of [16, 64, 256]) {
  const bytes = new Uint8Array(sizeMb * 1024 * 1024);
  let downloadCalls = 0;
  let verifyCalls = 0;
  const startedAt = performance.now();
  const result = await downloadBlobVerified({
    async download() {
      downloadCalls += 1;
      if (downloadCalls === 1) return new Promise(() => {});
      return { blob: new Blob([bytes]), metadata: { size: bytes.length } };
    },
    getSize: ({ metadata }) => metadata.size,
    async verify() {
      verifyCalls += 1;
      return true;
    },
  }, `/synthetic/${sizeMb}mb.lal`, {
    attempts: 2,
    operationTimeoutMs: timeoutMs,
    provider: "synthetic",
  });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.blob.size, bytes.length);
  assert.equal(downloadCalls, 2, "a stalled response must be abandoned before the safe retry");
  assert.equal(verifyCalls, 1, "only returned bytes may reach content verification");
  assert.ok(elapsedMs < 1000, "cloud open recovery must settle within a bounded interval");
  console.log([sizeMb, timeoutMs, downloadCalls, verifyCalls, elapsedMs, true]
    .map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
