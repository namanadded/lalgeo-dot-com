const DROPBOX_HASH_BLOCK_SIZE = 4 * 1024 * 1024;

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required to verify Dropbox uploads.");
  }
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

// Dropbox hashes each 4 MiB block, concatenates those digests, then hashes the
// concatenation. Keeping only the 32-byte block digests bounds extra memory.
export async function computeDropboxContentHash(blob) {
  const blockHashes = [];
  for (let offset = 0; offset < blob.size; offset += DROPBOX_HASH_BLOCK_SIZE) {
    const block = await blob.slice(offset, offset + DROPBOX_HASH_BLOCK_SIZE).arrayBuffer();
    blockHashes.push(await sha256(block));
  }
  const combined = new Uint8Array(blockHashes.length * 32);
  blockHashes.forEach((hash, index) => combined.set(hash, index * 32));
  return toHex(await sha256(combined));
}

export function isVerifiedDropboxUpdate(metadata, blobSize, commit, expectedContentHash) {
  const previousRev = commit?.mode?.[".tag"] === "update" ? commit.mode.update : null;
  return Boolean(
    previousRev
    && metadata?.rev
    && metadata.rev !== previousRev
    && metadata.size === blobSize
    && metadata.content_hash === expectedContentHash,
  );
}
