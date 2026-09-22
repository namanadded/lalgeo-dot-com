import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const source = await readFile(new URL("../../js/cloud-storage.js", import.meta.url), "utf8");
const cloud = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const CLIENT_COUNTS = [1_000, 10_000, 50_000];
const THROTTLE_WINDOW_MS = 5_000;

function legacyCallsBeforeWindow() {
  let elapsed = 0;
  let calls = 0;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    calls += 1;
    if (elapsed >= THROTTLE_WINDOW_MS) return calls;
    elapsed += 250 * (2 ** (attempt - 1));
  }
  return calls;
}

for (const clients of CLIENT_COUNTS) {
  const started = performance.now();
  let calls = 0;
  for (let client = 0; client < clients; client += 1) {
    let virtualNow = 0;
    const result = await cloud.retryCloudOperation(async () => {
      calls += 1;
      if (virtualNow < THROTTLE_WINDOW_MS) {
        const error = new Error("too_many_requests");
        error.status = 429;
        error.retryAfterMs = THROTTLE_WINDOW_MS - virtualNow;
        throw error;
      }
      return true;
    }, {
      attempts: 5,
      baseDelayMs: 250,
      provider: "synthetic",
      sleep: async (delayMs) => { virtualNow += delayMs; },
    });
    assert.equal(result, true);
  }
  const elapsedMs = performance.now() - started;
  const legacyCalls = clients * legacyCallsBeforeWindow();
  const reduction = 1 - (calls / legacyCalls);
  assert.equal(calls, clients * 2, "each client should retry once at the provider reopening time");
  assert.ok(reduction >= 0.6, "retry guidance must prevent at least 60% of throttled request amplification");
  console.log(JSON.stringify({
    clients,
    throttleWindowMs: THROTTLE_WINDOW_MS,
    baselineCalls: legacyCalls,
    controlledCalls: calls,
    requestReductionPercent: Number((reduction * 100).toFixed(2)),
    benchmarkMs: Number(elapsedMs.toFixed(2)),
  }));
}

console.log("Cloud retry benchmark passed: provider pacing bounds synthetic throttling amplification.");
