export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
export const DEFAULT_RESUMABLE_THRESHOLD = 16 * 1024 * 1024;

export class CloudStorageError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CloudStorageError";
    this.code = options.code || "unknown";
    this.retryable = options.retryable === true;
    this.provider = options.provider || "unknown";
    this.details = options.details || null;
  }
}

export function normalizeCloudError(error, provider = "unknown") {
  if (error instanceof CloudStorageError) return error;
  const status = Number(error?.status || error?.response?.status || 0);
  const summary = String(error?.error?.error_summary || error?.error || error?.message || error || "Cloud storage request failed");
  const lower = summary.toLowerCase();
  let code = "unknown";
  if (status === 401 || lower.includes("invalid_access_token") || lower.includes("expired_access_token")) code = "auth";
  else if (status === 409 || lower.includes("conflict")) code = "conflict";
  else if (status === 429 || lower.includes("too_many") || lower.includes("rate_limit")) code = "rate_limit";
  else if (status === 507 || lower.includes("insufficient_space") || lower.includes("quota")) code = "quota";
  else if (status >= 500 || lower.includes("network") || lower.includes("timeout") || lower.includes("offline")) code = "unavailable";
  return new CloudStorageError(summary, {
    cause: error,
    code,
    provider,
    retryable: code === "rate_limit" || code === "unavailable",
    details: { status },
  });
}

function throwIfCloudOperationAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  const error = new Error("Cloud storage operation aborted");
  error.name = "AbortError";
  throw error;
}

export async function retryCloudOperation(operation, options = {}) {
  const attempts = Math.max(1, options.attempts || 4);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const sleep = options.sleep || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfCloudOperationAborted(options.signal);
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = normalizeCloudError(error, options.provider);
      if (!lastError.retryable || attempt === attempts) throw lastError;
      await sleep(baseDelayMs * (2 ** (attempt - 1)));
      throwIfCloudOperationAborted(options.signal);
    }
  }
  throw lastError;
}

/**
 * Preserve an immutable provider revision without transferring its contents
 * through the browser. Adapters must address the exact revision, rather than a
 * mutable path, so a concurrent remote edit cannot be archived as the version
 * the caller believes it is saving over.
 */
export async function copyCloudRevisionSnapshot(adapter, request, options = {}) {
  if (typeof adapter?.copyRevision !== "function") {
    throw new TypeError("Cloud revision snapshot adapter requires copyRevision().");
  }
  const sourcePath = String(request?.sourcePath || "");
  const destinationPath = String(request?.destinationPath || "");
  const revision = String(request?.revision || "");
  if (!sourcePath || !destinationPath || !revision) {
    throw new TypeError("Cloud revision snapshot requires sourcePath, destinationPath, and revision.");
  }
  throwIfCloudOperationAborted(options.signal);
  try {
    const result = await adapter.copyRevision({ sourcePath, destinationPath, revision });
    if (!result) {
      throw new CloudStorageError("Cloud provider did not confirm the revision snapshot.", {
        code: "integrity",
        provider: options.provider,
        retryable: false,
      });
    }
    return result;
  } catch (error) {
    throw normalizeCloudError(error, options.provider);
  }
}

function assertDownloadAdapter(adapter) {
  for (const method of ["download", "getSize", "verify"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`Verified download adapter requires ${method}().`);
    }
  }
}

/**
 * Download and verify provider content before callers parse or replace local state.
 * Integrity failures are retryable because a truncated transport response can be
 * transient, but the unverified bytes are never returned to project logic.
 */
export async function downloadBlobVerified(adapter, request, options = {}) {
  assertDownloadAdapter(adapter);
  const attempts = Math.max(1, options.attempts || 2);
  const maxBytes = Math.max(1, options.maxBytes || Number.MAX_SAFE_INTEGER);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfCloudOperationAborted(options.signal);
    try {
      const result = await adapter.download(request);
      const blob = result?.blob;
      const declaredSize = Number(adapter.getSize(result));
      const actualSize = Number(blob?.size);
      if (!Number.isSafeInteger(actualSize) || actualSize < 0) {
        throw new CloudStorageError("Cloud provider returned unreadable file contents.", {
          code: "integrity",
          provider: options.provider,
          retryable: true,
        });
      }
      if (actualSize > maxBytes || (Number.isSafeInteger(declaredSize) && declaredSize > maxBytes)) {
        throw new CloudStorageError(`Cloud file exceeds the ${maxBytes}-byte safe open limit.`, {
          code: "too_large",
          provider: options.provider,
          retryable: false,
          details: { actualSize, declaredSize, maxBytes },
        });
      }
      if (Number.isSafeInteger(declaredSize) && declaredSize !== actualSize) {
        throw new CloudStorageError("Cloud download byte count does not match provider metadata.", {
          code: "integrity",
          provider: options.provider,
          retryable: true,
          details: { actualSize, declaredSize },
        });
      }
      if (!await adapter.verify(result)) {
        throw new CloudStorageError("Cloud download failed provider content verification.", {
          code: "integrity",
          provider: options.provider,
          retryable: true,
          details: { actualSize, declaredSize },
        });
      }
      options.onVerified?.({ attempt, bytes: actualSize });
      return result;
    } catch (error) {
      lastError = normalizeCloudError(error, options.provider);
      if (!lastError.retryable || attempt === attempts) throw lastError;
      options.onRetry?.({ attempt, maxAttempts: attempts, error: lastError });
    }
  }
  throw lastError;
}

function assertCatalogAdapter(adapter) {
  for (const method of ["list", "continue"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`Cloud catalog adapter requires ${method}().`);
    }
  }
}

function catalogCursorKey(cursor) {
  if (typeof cursor === "string") return cursor;
  if (typeof cursor === "number" || typeof cursor === "boolean") return String(cursor);
  try {
    return JSON.stringify(cursor);
  } catch {
    return String(cursor);
  }
}

/**
 * Walk a provider catalog one page at a time without retaining provider pages.
 * Scopes are deliberately explicit so a provider cannot silently widen a project
 * listing to a user's entire cloud account.
 */
export async function collectCloudFiles(adapter, options = {}) {
  assertCatalogAdapter(adapter);
  const scopes = Array.isArray(options.scopes) ? options.scopes : [];
  const accept = options.accept || (() => true);
  const mapEntry = options.mapEntry || ((entry) => entry);
  const keyOf = options.keyOf || ((entry) => entry?.id || entry?.pathLower || entry?.pathDisplay || entry?.name);
  const rows = [];
  const seen = new Set();
  const maxPages = Math.max(1, options.maxPages || 10_000);
  const maxExamined = Math.max(1, options.maxExamined || 2_000_000);
  const maxResults = Math.max(1, options.maxResults || 100_000);
  let pages = 0;
  let examined = 0;

  for (const scope of scopes) {
    let cursor = null;
    const scopeCursors = new Set();
    do {
      throwIfCloudOperationAborted(options.signal);
      if (pages >= maxPages) {
        throw new CloudStorageError(`Cloud catalog exceeded the ${maxPages}-page safety limit.`, {
          code: "catalog_limit",
          provider: options.provider,
          retryable: false,
          details: { pages, examined, matched: rows.length, limit: "pages" },
        });
      }
      let page;
      try {
        page = cursor ? await adapter.continue(cursor) : await adapter.list(scope);
      } catch (error) {
        if (adapter.isMissingScope?.(error, scope)) break;
        throw error;
      }
      pages += 1;
      const entries = Array.isArray(page?.entries) ? page.entries : [];
      if (examined + entries.length > maxExamined) {
        throw new CloudStorageError(`Cloud catalog exceeded the ${maxExamined}-entry safety limit.`, {
          code: "catalog_limit",
          provider: options.provider,
          retryable: false,
          details: { pages, examined, matched: rows.length, limit: "examined" },
        });
      }
      examined += entries.length;
      for (const entry of entries) {
        if (!accept(entry, scope)) continue;
        const row = mapEntry(entry, scope);
        const key = String(keyOf(row, entry, scope) || "").toLowerCase();
        if (!key || seen.has(key)) continue;
        if (rows.length >= maxResults) {
          throw new CloudStorageError(`Cloud catalog exceeded the ${maxResults}-project safety limit.`, {
            code: "catalog_limit",
            provider: options.provider,
            retryable: false,
            details: { pages, examined, matched: rows.length, limit: "results" },
          });
        }
        seen.add(key);
        rows.push(row);
      }
      if (page?.hasMore && (page.cursor === null || page.cursor === undefined || page.cursor === "")) {
        throw new CloudStorageError("Cloud provider reported more catalog pages without a cursor.", {
          code: "catalog_integrity",
          provider: options.provider,
          retryable: false,
          details: { pages, examined, matched: rows.length },
        });
      }
      const nextCursor = page?.hasMore ? page.cursor : null;
      if (nextCursor !== null) {
        const cursorKey = typeof options.cursorKey === "function"
          ? String(options.cursorKey(nextCursor, scope))
          : catalogCursorKey(nextCursor);
        if (scopeCursors.has(cursorKey)) {
          throw new CloudStorageError("Cloud provider repeated a catalog cursor.", {
            code: "catalog_integrity",
            provider: options.provider,
            retryable: false,
            details: { pages, examined, matched: rows.length },
          });
        }
        scopeCursors.add(cursorKey);
      }
      cursor = nextCursor;
      options.onPage?.({ scope, pages, examined, matched: rows.length });
    } while (cursor);
  }

  return { rows, stats: { pages, examined, matched: rows.length } };
}

function assertUploadAdapter(adapter) {
  for (const method of ["start", "append", "finish", "lookupOffset"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`Resumable upload adapter requires ${method}().`);
    }
  }
}

export async function uploadBlobResumably(adapter, blob, options = {}) {
  assertUploadAdapter(adapter);
  const chunkSize = Math.max(256 * 1024, options.chunkSize || DEFAULT_CHUNK_SIZE);
  const recoverySleep = options.sleep || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  const retryOptions = {
    attempts: options.attempts,
    baseDelayMs: options.baseDelayMs,
    sleep: recoverySleep,
    provider: options.provider,
    signal: options.signal,
  };
  const maxNoProgressRecoveries = Math.max(1, options.maxNoProgressRecoveries || 4);
  let sessionId = options.sessionId || null;
  let offset = Math.max(0, options.offset || 0);
  let noProgressRecoveries = 0;

  if (!sessionId) {
    throwIfCloudOperationAborted(options.signal);
    const firstEnd = Math.min(chunkSize, blob.size);
    const result = await retryCloudOperation(() => adapter.start(blob.slice(0, firstEnd)), retryOptions);
    sessionId = result.sessionId;
    offset = firstEnd;
  }

  while (offset < blob.size) {
    throwIfCloudOperationAborted(options.signal);
    const end = Math.min(offset + chunkSize, blob.size);
    const isLast = end === blob.size;
    try {
      // Append and finish are not blindly retried: a connection can fail after the
      // provider accepted bytes. Reconcile the remote cursor before sending again.
      const result = isLast
        ? await adapter.finish(sessionId, offset, blob.slice(offset, end), options.commit)
        : await adapter.append(sessionId, offset, blob.slice(offset, end));
      if (isLast) return result;
      offset = end;
      noProgressRecoveries = 0;
      options.onProgress?.({ loaded: offset, total: blob.size });
    } catch (error) {
      const normalized = normalizeCloudError(error, options.provider);
      if (!normalized.retryable) throw normalized;
      // A failed finish may already have committed and closed the session. Providers
      // that can verify remote content resolve that ambiguity without re-uploading.
      if (isLast) {
        if (typeof adapter.verifyCommit !== "function") throw normalized;
        const committed = await retryCloudOperation(
          () => adapter.verifyCommit(blob, options.commit),
          retryOptions,
        );
        if (committed) {
          options.onProgress?.({ loaded: blob.size, total: blob.size });
          return committed;
        }
        throw normalized;
      }
      const remoteOffset = await retryCloudOperation(() => adapter.lookupOffset(sessionId), retryOptions);
      if (!Number.isSafeInteger(remoteOffset) || remoteOffset < offset || remoteOffset > blob.size) throw normalized;
      if (remoteOffset === offset) {
        noProgressRecoveries += 1;
        options.onRecovery?.({
          attempt: noProgressRecoveries,
          maxAttempts: maxNoProgressRecoveries,
          offset,
          total: blob.size,
        });
        if (noProgressRecoveries >= maxNoProgressRecoveries) {
          throw new CloudStorageError(
            `Upload made no progress after ${noProgressRecoveries} recovery attempts.`,
            {
              cause: normalized,
              code: normalized.code,
              provider: normalized.provider,
              retryable: normalized.retryable,
              details: { ...normalized.details, offset, attempts: noProgressRecoveries },
            },
          );
        }
        await retryOptions.sleep(retryOptions.baseDelayMs * (2 ** (noProgressRecoveries - 1)));
      } else {
        noProgressRecoveries = 0;
      }
      offset = remoteOffset;
    }
  }

  return adapter.finish(sessionId, offset, new Blob([]), options.commit);
}
