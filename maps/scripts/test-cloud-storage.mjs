import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const cloud = await importModule("../../js/cloud-storage.js");
const dropboxSource = await readFile(new URL("../../js/dropbox-api.js", import.meta.url), "utf8");

let cyclicCatalogCalls = 0;
await assert.rejects(
  cloud.collectCloudFiles({
    async list() {
      cyclicCatalogCalls += 1;
      return { entries: [{ id: "safe-1" }], hasMore: true, cursor: "stuck" };
    },
    async continue() {
      cyclicCatalogCalls += 1;
      return { entries: [{ id: "safe-2" }], hasMore: true, cursor: "stuck" };
    },
  }, { scopes: [{ path: "/safe-test" }], provider: "mock" }),
  (error) => error.code === "catalog_integrity" && error.details.pages === 2,
  "a repeated provider cursor fails closed instead of listing forever",
);
assert.equal(cyclicCatalogCalls, 2);

await assert.rejects(
  cloud.collectCloudFiles({
    async list() { return { entries: [{ id: "one" }, { id: "two" }], hasMore: false }; },
    async continue() { throw new Error("continue should not be reached"); },
  }, { scopes: [{}], provider: "mock", maxResults: 1 }),
  (error) => error.code === "catalog_limit" && error.details.limit === "results",
  "catalog result budgets reject partial oversized listings",
);

const abortedCatalog = new AbortController();
abortedCatalog.abort(new DOMException("cancel listing", "AbortError"));
await assert.rejects(
  cloud.collectCloudFiles({
    async list() { throw new Error("list should not be reached"); },
    async continue() {},
  }, { scopes: [{}], signal: abortedCatalog.signal }),
  (error) => error.name === "AbortError",
  "callers can cancel catalog listing before a provider request",
);
assert.match(dropboxSource, /maxPages:\s*2_000/);
assert.match(dropboxSource, /maxExamined:\s*250_000/);
assert.match(dropboxSource, /maxResults:\s*50_000/);

const safeDownloadBytes = new Uint8Array(1_500_000).map((_, index) => index % 239);
let downloadAttempts = 0;
const downloadRetries = [];
const verifiedDownload = await cloud.downloadBlobVerified({
  async download() {
    downloadAttempts += 1;
    const bytesForAttempt = downloadAttempts === 1 ? safeDownloadBytes.slice(0, -17) : safeDownloadBytes;
    return {
      blob: new Blob([bytesForAttempt]),
      metadata: { size: safeDownloadBytes.byteLength, checksum: "safe-checksum" },
    };
  },
  getSize: ({ metadata }) => metadata.size,
  async verify({ metadata }) { return metadata.checksum === "safe-checksum"; },
}, "/safe-test/download.lal", {
  provider: "mock",
  maxBytes: 2_000_000,
  onRetry: (event) => downloadRetries.push(event.error.code),
});
assert.equal(verifiedDownload.blob.size, safeDownloadBytes.byteLength);
assert.equal(downloadAttempts, 2, "a truncated response is discarded and fetched once more");
assert.deepEqual(downloadRetries, ["integrity"]);

await assert.rejects(
  cloud.downloadBlobVerified({
    async download() { return { blob: new Blob([safeDownloadBytes]), metadata: { size: safeDownloadBytes.length } }; },
    getSize: ({ metadata }) => metadata.size,
    async verify() { return false; },
  }, "/safe-test/corrupt.lal", { provider: "mock", attempts: 2 }),
  (error) => error.code === "integrity" && error.retryable,
  "content that repeatedly fails verification never reaches project parsing",
);

await assert.rejects(
  cloud.downloadBlobVerified({
    async download() { return { blob: new Blob([safeDownloadBytes]), metadata: { size: safeDownloadBytes.length } }; },
    getSize: ({ metadata }) => metadata.size,
    async verify() { return true; },
  }, "/safe-test/oversize.lal", { provider: "mock", maxBytes: 1_000_000 }),
  (error) => error.code === "too_large" && !error.retryable,
  "declared or actual files over the safe open limit are rejected before parsing",
);
assert.match(dropboxSource, /downloadBlobVerified\(/);
assert.match(dropboxSource, /computeDropboxContentHash\(blob\) === file\.content_hash/,
  "Dropbox opens must verify the provider content hash");

const smallBlob = new Blob([new Uint8Array(1_000_000).fill(17)]);
let smallUploadCalls = 0;
let smallVerificationCalls = 0;
const smallCommit = { path: "/safe-test/small.lal", mode: { ".tag": "update", update: "rev-before" } };
const recoveredSmallCommit = await cloud.uploadBlobWithCommitVerification({
  async upload() {
    smallUploadCalls += 1;
    const error = new Error("response lost after upload commit");
    error.status = 503;
    throw error;
  },
  async verifyCommit(candidate, commit) {
    smallVerificationCalls += 1;
    assert.equal(candidate, smallBlob);
    assert.equal(commit, smallCommit);
    return { path: commit.path, rev: "rev-after", size: candidate.size };
  },
}, smallBlob, smallCommit, { provider: "mock", baseDelayMs: 0, sleep: async () => {} });
assert.equal(recoveredSmallCommit.rev, "rev-after");
assert.equal(smallUploadCalls, 1, "an ambiguous direct upload must never be repeated");
assert.equal(smallVerificationCalls, 1, "exact remote metadata resolves a lost direct-upload response");

await assert.rejects(
  cloud.uploadBlobWithCommitVerification({
    async upload() {
      const error = new Error("response lost before commit");
      error.status = 503;
      throw error;
    },
    async verifyCommit() { return null; },
  }, smallBlob, smallCommit, { provider: "mock", baseDelayMs: 0, sleep: async () => {} }),
  (error) => error.code === "unavailable",
  "an unproved direct upload keeps the original retryable failure visible",
);

let nonRetryableVerifications = 0;
await assert.rejects(
  cloud.uploadBlobWithCommitVerification({
    async upload() {
      const error = new Error("stale revision conflict");
      error.status = 409;
      throw error;
    },
    async verifyCommit() { nonRetryableVerifications += 1; },
  }, smallBlob, smallCommit, { provider: "mock" }),
  (error) => error.code === "conflict" && !error.retryable,
  "known stale revisions fail immediately",
);
assert.equal(nonRetryableVerifications, 0, "conflicts are not mistaken for ambiguous commits");
assert.match(dropboxSource, /uploadBlobWithCommitVerification\(/,
  "Dropbox direct revision updates must use provider-independent commit recovery");

const snapshotCalls = [];
const snapshot = await cloud.copyCloudRevisionSnapshot({
  async copyRevision(request) {
    snapshotCalls.push(request);
    return { rev: "snapshot-rev", path: request.destinationPath };
  },
}, {
  sourcePath: "/safe-test/project.lal",
  destinationPath: "/safe-test/_versions/project--rev-1.lal",
  revision: "rev-1",
}, { provider: "mock" });
assert.equal(snapshot.rev, "snapshot-rev");
assert.deepEqual(snapshotCalls, [{
  sourcePath: "/safe-test/project.lal",
  destinationPath: "/safe-test/_versions/project--rev-1.lal",
  revision: "rev-1",
}]);
await assert.rejects(
  cloud.copyCloudRevisionSnapshot({ async copyRevision() { return null; } }, {
    sourcePath: "/safe-test/project.lal",
    destinationPath: "/safe-test/_versions/project.lal",
    revision: "rev-stale",
  }, { provider: "mock" }),
  (error) => error.code === "integrity" && !error.retryable,
  "an unconfirmed server-side snapshot fails closed",
);
assert.match(dropboxSource, /filesCopyV2\(\{/,
  "Dropbox version history must use a server-side copy");
assert.match(dropboxSource, /from_path:\s*`rev:\$\{revision\}`/,
  "Dropbox snapshots must address the immutable expected revision");
const snapshotMethod = dropboxSource.match(/async writeVersionSnapshot[\s\S]*?\n  }/)?.[0] || "";
assert.doesNotMatch(snapshotMethod, /filesDownload|filesUpload/,
  "version history must not round-trip project bytes through the browser");

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

assert.equal(cloud.getCloudRetryAfterMs({ headers: { "Retry-After": "2.5" } }), 2500);
assert.equal(cloud.getCloudRetryAfterMs({ error: { retry_after: 7 } }), 7000,
  "provider retry_after fields use the standard seconds unit");
assert.equal(cloud.getCloudRetryAfterMs({ retryAfterMs: 125 }), 125,
  "adapters can provide an explicit millisecond delay without unit ambiguity");

let throttledAttempts = 0;
const retryDelays = [];
const throttledResult = await cloud.retryCloudOperation(async () => {
  throttledAttempts += 1;
  if (throttledAttempts === 1) {
    const error = new Error("too_many_requests");
    error.status = 429;
    error.headers = { "Retry-After": "3" };
    throw error;
  }
  return "recovered";
}, {
  provider: "mock",
  baseDelayMs: 250,
  sleep: async (delay) => retryDelays.push(delay),
  onRetry: (event) => assert.equal(event.error.code, "rate_limit"),
});
assert.equal(throttledResult, "recovered");
assert.deepEqual(retryDelays, [3000], "provider throttling guidance overrides a shorter exponential delay");

const backoffController = new AbortController();
let backoffStarted = false;
const cancelledBackoff = cloud.retryCloudOperation(async () => {
  const error = new Error("offline");
  error.status = 503;
  throw error;
}, {
  provider: "mock",
  signal: backoffController.signal,
  sleep: async () => {
    backoffStarted = true;
    await new Promise(() => {});
  },
});
await Promise.resolve();
assert.equal(backoffStarted, true);
backoffController.abort(new DOMException("user cancelled", "AbortError"));
await assert.rejects(cancelledBackoff, (error) => error.name === "AbortError",
  "cancellation interrupts an active retry wait instead of waiting for its timer");

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

console.log("Cloud storage contract: scoped catalog, resumable recovery, rate-limit pacing, cancellation, and error taxonomy passed.");
