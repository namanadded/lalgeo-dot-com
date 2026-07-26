import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const cloud = await importModule("../../js/cloud-storage.js");
const dropboxSource = await readFile(new URL("../../js/dropbox-api.js", import.meta.url), "utf8");
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

let stalledAppendCalls = 0;
let stalledLookupCalls = 0;
const recoveryEvents = [];
await assert.rejects(
  cloud.uploadBlobResumably({
    async start() { return { sessionId: "stalled-session" }; },
    async append() {
      stalledAppendCalls += 1;
      const error = new Error("upload endpoint unavailable");
      error.status = 503;
      throw error;
    },
    async finish() { throw new Error("finish should not be reached"); },
    async lookupOffset() {
      stalledLookupCalls += 1;
      return 1_000_000;
    },
  }, blob, {
    chunkSize: 1_000_000,
    maxNoProgressRecoveries: 3,
    baseDelayMs: 0,
    sleep: async () => {},
    provider: "mock",
    commit: { path: "/safe-test/stalled.lal" },
    onRecovery: (event) => recoveryEvents.push(event),
  }),
  (error) => error.code === "unavailable"
    && error.details.offset === 1_000_000
    && error.details.attempts === 3,
  "a healthy cursor endpoint cannot hide an indefinitely stalled upload",
);
assert.equal(stalledAppendCalls, 3, "the no-progress recovery budget bounds append attempts");
assert.equal(stalledLookupCalls, 3, "each failed append reconciles exactly once");
assert.deepEqual(recoveryEvents.map((event) => event.attempt), [1, 2, 3]);

const controller = new AbortController();
let cancellationAppendCalls = 0;
await assert.rejects(
  cloud.uploadBlobResumably({
    async start() { return { sessionId: "cancel-session" }; },
    async append() {
      cancellationAppendCalls += 1;
      const error = new Error("offline");
      error.status = 503;
      throw error;
    },
    async finish() { throw new Error("finish should not be reached"); },
    async lookupOffset() {
      controller.abort(new DOMException("user cancelled", "AbortError"));
      return 1_000_000;
    },
  }, blob, {
    chunkSize: 1_000_000,
    baseDelayMs: 0,
    sleep: async () => {},
    signal: controller.signal,
    provider: "mock",
  }),
  (error) => error.name === "AbortError",
  "callers can cancel a resumable upload during recovery",
);
assert.equal(cancellationAppendCalls, 1);

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

const catalogCalls = [];
const catalogPages = new Map([
  ["/projects", { entries: [
    { id: "1", path: "/projects/a.lal", name: "a.lal" },
    { id: "skip", path: "/projects/readme.txt", name: "readme.txt" },
  ], hasMore: true, cursor: "projects-2" }],
  ["projects-2", { entries: [{ id: "2", path: "/projects/b.zip", name: "b.zip" }], hasMore: false }],
  ["", { entries: [
    { id: "1-copy", path: "/projects/a.lal", name: "a.lal" },
    { id: "3", path: "/legacy.lal", name: "legacy.lal" },
  ], hasMore: false }],
]);
const catalog = await cloud.collectCloudFiles({
  async list(scope) {
    catalogCalls.push([scope.path, scope.recursive]);
    return catalogPages.get(scope.path);
  },
  async continue(cursor) {
    catalogCalls.push([cursor, "continue"]);
    return catalogPages.get(cursor);
  },
}, {
  scopes: [{ path: "/projects", recursive: true }, { path: "", recursive: false }],
  accept: (entry) => /\.(lal|zip)$/i.test(entry.name),
  mapEntry: (entry) => ({ ...entry, pathLower: entry.path.toLowerCase() }),
  keyOf: (row) => row.pathLower,
});
assert.deepEqual(catalog.rows.map((row) => row.name), ["a.lal", "b.zip", "legacy.lal"]);
assert.deepEqual(catalog.stats, { pages: 3, examined: 5, matched: 3 });
assert.deepEqual(catalogCalls, [["/projects", true], ["projects-2", "continue"], ["", false]],
  "catalog recursion stays inside explicit project roots");
assert.match(dropboxSource, /\{ path: "\/LalGeoDB", recursive: true \}/);
assert.match(dropboxSource, /\{ path: "", recursive: false \}/,
  "Dropbox fallback must never recursively scan the account root");
assert.doesNotMatch(dropboxSource, /filesListFolder\(\{ path: scope\.path, recursive: true \}\)/,
  "provider integration must honor each catalog scope's recursion boundary");

console.log("Cloud storage contract: scoped catalog, resumable recovery, and error taxonomy passed.");
console.log("Cloud storage contract: resumable recovery, ambiguous commit verification, and error taxonomy passed.");
