import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../js/cloud-storage.js", import.meta.url), "utf8");
const cloud = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const cases = [
  { features: 1_000, bytes: 0.24 * 1024 * 1024 },
  { features: 10_000, bytes: 3.63 * 1024 * 1024 },
  { features: 50_000, bytes: 30.44 * 1024 * 1024 },
];

console.log("features,file_mb,recovery_ms,move_calls,metadata_calls,client_transfer_bytes");
for (const testCase of cases) {
  let moveCalls = 0;
  let metadataCalls = 0;
  const identity = {
    id: `id:synthetic-${testCase.features}`,
    rev: "rev-safe",
    size: Math.round(testCase.bytes),
  };
  const started = performance.now();
  const result = await cloud.moveCloudObjectWithVerification({
    async getMetadata(path) {
      metadataCalls += 1;
      return { ...identity, path };
    },
    async move() {
      moveCalls += 1;
      return new Promise(() => {});
    },
    isSameObject: (before, after) => before.id === after.id
      && before.rev === after.rev
      && before.size === after.size,
  }, {
    sourcePath: `/safe-synthetic/${testCase.features}-before.lal`,
    destinationPath: `/safe-synthetic/${testCase.features}-after.lal`,
  }, {
    provider: "mock",
    operationTimeoutMs: 10,
    verificationAttempts: 1,
  });
  const elapsedMs = performance.now() - started;
  assert.equal(result.id, identity.id);
  assert.equal(moveCalls, 1, "ambiguous moves are not repeated");
  assert.equal(metadataCalls, 2, "source and destination identities are each read once");
  assert(elapsedMs < 1_000, "rename recovery must remain bounded");
  console.log([
    testCase.features,
    (testCase.bytes / 1024 / 1024).toFixed(2),
    elapsedMs.toFixed(2),
    moveCalls,
    metadataCalls,
    0,
  ].join(","));
}

console.log("Cloud rename benchmark passed: stalled moves recover by metadata identity without project transfer.");
