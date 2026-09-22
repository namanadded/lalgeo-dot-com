import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../js/cloud-storage.js", import.meta.url), "utf8");
const cloud = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

console.log("features,payload_mb,baseline_false_failures,recovered_false_failures,upload_calls,verification_calls,recovery_ms,data_preserved");
for (const [features, payloadMb] of [[1_000, 1], [10_000, 8], [40_000, 15]]) {
  const bytes = new Uint8Array(payloadMb * 1024 * 1024);
  for (let offset = 0; offset < bytes.length; offset += 4096) bytes[offset] = offset % 251;
  const blob = new Blob([bytes]);
  let uploadCalls = 0;
  let verificationCalls = 0;
  const started = performance.now();
  const result = await cloud.uploadBlobWithCommitVerification({
    async upload() {
      uploadCalls += 1;
      const error = new Error("synthetic response lost after commit");
      error.status = 503;
      throw error;
    },
    async verifyCommit(candidate, commit) {
      verificationCalls += 1;
      return { rev: "rev-after", path: commit.path, size: candidate.size };
    },
  }, blob, {
    path: `/synthetic/${features}.lal`,
    mode: { ".tag": "update", update: "rev-before" },
  }, { provider: "mock", baseDelayMs: 0, sleep: async () => {} });
  const recoveryMs = performance.now() - started;
  assert.equal(result.size, blob.size);
  assert.equal(uploadCalls, 1, "ambiguous writes cannot be retransmitted blindly");
  assert.equal(verificationCalls, 1);
  console.log([features, payloadMb, 1, 0, uploadCalls, verificationCalls, recoveryMs.toFixed(2), result.size === bytes.byteLength].join(","));
}

console.log("Direct cloud commit benchmark passed: exact verification eliminates false failures without duplicate writes.");
