import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { uploadBlobWithCommitVerification } = await importModule("../../js/cloud-storage.js");
const deadlineMs = 10;

console.log("payload_mb,deadline_ms,upload_calls,verification_calls,elapsed_ms,recovered");
for (const sizeMb of [1, 8, 15]) {
  const blob = new Blob([new Uint8Array(sizeMb * 1024 * 1024)]);
  const commit = { path: `/synthetic/project-${sizeMb}.lal`, mode: { ".tag": "update", update: "rev-before" } };
  let uploadCalls = 0;
  let verificationCalls = 0;
  const startedAt = performance.now();
  const result = await uploadBlobWithCommitVerification({
    async upload() {
      uploadCalls += 1;
      return new Promise(() => {});
    },
    async verifyCommit(candidate, request) {
      verificationCalls += 1;
      assert.equal(candidate.size, blob.size);
      assert.equal(request, commit);
      return { path: request.path, rev: `rev-after-${sizeMb}`, size: candidate.size };
    },
  }, blob, commit, {
    provider: "synthetic",
    operationTimeoutMs: deadlineMs,
    verificationAttempts: 1,
  });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.rev, `rev-after-${sizeMb}`);
  assert.equal(uploadCalls, 1, "an ambiguous direct write must not be repeated");
  assert.equal(verificationCalls, 1, "deadline recovery requires exact remote verification");
  assert.ok(elapsedMs < 1000, "a permanently pending direct upload must settle within a bounded interval");
  console.log([sizeMb, deadlineMs, uploadCalls, verificationCalls, elapsedMs, true]
    .map((value) => typeof value === "number" ? value.toFixed(2) : value).join(","));
}
