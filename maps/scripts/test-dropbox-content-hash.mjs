import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

globalThis.crypto ||= webcrypto;

async function importModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function referenceDropboxHash(bytes) {
  const blockDigests = [];
  for (let offset = 0; offset < bytes.length; offset += 4 * 1024 * 1024) {
    blockDigests.push(createHash("sha256").update(bytes.subarray(offset, offset + 4 * 1024 * 1024)).digest());
  }
  return createHash("sha256").update(Buffer.concat(blockDigests)).digest("hex");
}

const { computeDropboxContentHash, isVerifiedDropboxUpdate } = await importModule("../../js/dropbox-content-hash.js");
for (const size of [0, 1, 4 * 1024 * 1024, 9 * 1024 * 1024 + 17]) {
  const bytes = Buffer.allocUnsafe(size);
  for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
  assert.equal(await computeDropboxContentHash(new Blob([bytes])), referenceDropboxHash(bytes), `hash matches at ${size} bytes`);
}

const commit = { path: "/safe-test/project.lal", mode: { ".tag": "update", update: "rev-before" } };
const metadata = { rev: "rev-after", size: 123, content_hash: "expected" };
assert.equal(isVerifiedDropboxUpdate(metadata, 123, commit, "expected"), true);
assert.equal(isVerifiedDropboxUpdate({ ...metadata, rev: "rev-before" }, 123, commit, "expected"), false, "unchanged revision is not a committed update");
assert.equal(isVerifiedDropboxUpdate(metadata, 123, { mode: { ".tag": "add" } }, "expected"), false, "autorenamed adds are not falsely verified");
assert.equal(isVerifiedDropboxUpdate(metadata, 124, commit, "expected"), false, "size mismatch is rejected");
assert.equal(isVerifiedDropboxUpdate(metadata, 123, commit, "different"), false, "hash mismatch is rejected");

console.log("Dropbox content hash and revision-controlled commit verification passed.");
