import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const cloud = await importModule("../../js/cloud-storage.js");
const bytes = new Uint8Array(2_500_000).map((_, index) => index % 251);
const blob = new Blob([bytes]);
let remote = new Uint8Array(0);
let interrupted = false;
const calls = [];
const adapter = {
  async start(chunk) {
    calls.push("start");
    remote = new Uint8Array(await chunk.arrayBuffer());
    return { sessionId: "safe-test-session" };
  },
  async append(_sessionId, offset, chunk) {
    calls.push(`append:${offset}`);
    if (!interrupted) {
      interrupted = true;
      const accepted = new Uint8Array(await chunk.slice(0, 300_000).arrayBuffer());
      const next = new Uint8Array(offset + accepted.length);
      next.set(remote);
      next.set(accepted, offset);
      remote = next;
      const error = new Error("network interrupted");
      error.status = 503;
      throw error;
    }
    const accepted = new Uint8Array(await chunk.arrayBuffer());
    const next = new Uint8Array(offset + accepted.length);
    next.set(remote.slice(0, offset));
    next.set(accepted, offset);
    remote = next;
  },
  async finish(_sessionId, offset, chunk, commit) {
    calls.push(`finish:${offset}`);
    await this.append("safe-test-session", offset, chunk);
    return { rev: "test-rev-2", path: commit.path };
  },
  async lookupOffset() {
    calls.push("lookup");
    return remote.length;
  },
};

const result = await cloud.uploadBlobResumably(adapter, blob, {
  chunkSize: 1_000_000,
  attempts: 4,
  baseDelayMs: 0,
  sleep: async () => {},
  provider: "mock",
  commit: { path: "/safe-test/large.lal" },
});
assert.equal(result.rev, "test-rev-2");
assert.deepEqual(remote, bytes, "interrupted upload resumes at provider-reported offset without data loss");
assert.ok(calls.includes("lookup"), "interruption reconciles the remote cursor");

let finishAttempts = 0;
let verificationAttempts = 0;
const committedMetadata = { rev: "test-rev-3", path: "/safe-test/committed.lal", size: blob.size };
const responseLostAdapter = {
  async start() { return { sessionId: "response-lost-session" }; },
  async append() {},
  async finish() {
    finishAttempts += 1;
    const error = new Error("connection closed after commit");
    error.status = 503;
    throw error;
  },
  async lookupOffset() { return blob.size; },
  async verifyCommit(candidate, commit) {
    verificationAttempts += 1;
    assert.equal(candidate, blob);
    assert.equal(commit.path, committedMetadata.path);
    return committedMetadata;
  },
};
const recoveredCommit = await cloud.uploadBlobResumably(responseLostAdapter, blob, {
  chunkSize: 1_000_000,
  attempts: 2,
  baseDelayMs: 0,
  sleep: async () => {},
  provider: "mock",
  commit: { path: committedMetadata.path },
});
assert.equal(recoveredCommit.rev, "test-rev-3");
assert.equal(finishAttempts, 1, "an ambiguous finish is never blindly repeated");
assert.equal(verificationAttempts, 1, "remote content verification resolves the lost response");

const unverifiedAdapter = { ...responseLostAdapter, async verifyCommit() { return null; } };
await assert.rejects(
  cloud.uploadBlobResumably(unverifiedAdapter, blob, {
    chunkSize: 1_000_000,
    attempts: 1,
    baseDelayMs: 0,
    provider: "mock",
    commit: { path: "/safe-test/not-committed.lal" },
  }),
  (error) => error.code === "unavailable",
  "the original retryable failure remains visible when content cannot be verified",
);

for (const [error, code, retryable] of [
  [{ status: 401, message: "expired_access_token" }, "auth", false],
  [{ status: 409, message: "path conflict" }, "conflict", false],
  [{ status: 429, message: "too_many_requests" }, "rate_limit", true],
  [{ status: 507, message: "insufficient_space" }, "quota", false],
  [{ status: 503, message: "offline" }, "unavailable", true],
]) {
  const normalized = cloud.normalizeCloudError(error, "mock");
  assert.equal(normalized.code, code);
  assert.equal(normalized.retryable, retryable);
}

console.log("Cloud storage contract: resumable recovery, ambiguous commit verification, and error taxonomy passed.");
