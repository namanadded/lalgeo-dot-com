import { performance } from "node:perf_hooks";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

globalThis.crypto ||= webcrypto;

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { computeDropboxContentHash } = await importModule("../../js/dropbox-content-hash.js");

console.log("payload_mb,hash_ms,throughput_mb_s,heap_delta_mb,remote_redownload_avoided_mb");
for (const sizeMb of [16, 32, 64]) {
  const bytes = new Uint8Array(sizeMb * 1024 * 1024);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
  const blob = new Blob([bytes]);
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  await computeDropboxContentHash(blob);
  const elapsed = performance.now() - startedAt;
  const heapDelta = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  console.log([sizeMb, elapsed, sizeMb / (elapsed / 1000), heapDelta, sizeMb].map((value) => value.toFixed(2)).join(","));
}
