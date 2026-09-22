import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const cloud = await importModule("../../js/cloud-storage.js");
const hash = await importModule("../../js/dropbox-content-hash.js");

console.log("size_mb,baseline_unverified_ms,verified_ms,verification_overhead_ms,heap_delta_mb,truncated_attempts,data_preserved");
for (const sizeMb of [16, 32, 64]) {
  const bytes = new Uint8Array(sizeMb * 1024 * 1024);
  for (let index = 0; index < bytes.length; index += 4096) bytes[index] = index % 251;
  const blob = new Blob([bytes]);
  const contentHash = await hash.computeDropboxContentHash(blob);

  const baselineStart = performance.now();
  await blob.arrayBuffer();
  const baselineMs = performance.now() - baselineStart;

  let attempts = 0;
  const heapStart = process.memoryUsage().heapUsed;
  const verifiedStart = performance.now();
  const result = await cloud.downloadBlobVerified({
    async download() {
      attempts += 1;
      return {
        blob: attempts === 1 ? blob.slice(0, blob.size - 4096) : blob,
        metadata: { size: blob.size, contentHash },
      };
    },
    getSize: ({ metadata }) => metadata.size,
    async verify({ blob: candidate, metadata }) {
      return await hash.computeDropboxContentHash(candidate) === metadata.contentHash;
    },
  }, `/synthetic/${sizeMb}mb.lal`, {
    provider: "mock-dropbox",
    attempts: 2,
    maxBytes: 128 * 1024 * 1024,
  });
  const verifiedMs = performance.now() - verifiedStart;
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapStart) / 1024 / 1024;
  assert.equal(attempts, 2);
  assert.equal(result.blob.size, blob.size);
  console.log([
    sizeMb,
    baselineMs.toFixed(2),
    verifiedMs.toFixed(2),
    (verifiedMs - baselineMs).toFixed(2),
    heapDeltaMb.toFixed(2),
    attempts,
    result.blob.size === bytes.byteLength,
  ].join(","));
}
