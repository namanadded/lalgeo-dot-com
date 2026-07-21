import { exportLayer, parseLalArrayBuffer, slugify } from "./lal-file.js";
import { collectCloudFiles, DEFAULT_RESUMABLE_THRESHOLD, normalizeCloudError, uploadBlobResumably } from "./cloud-storage.js";

export const WORKER_BASE = "https://dropbox.lalgeo.com";
export const TOKEN_STORAGE_KEY = "lalgeo_dropbox_access_token";
export const TOKEN_STORAGE_SESSION_KEY = "lalgeo_dropbox_access_token_session";
export const CHOOSER_APP_KEY_KEY = "lalgeo_dropbox_chooser_app_key";
export const SURVEY_DROPBOX_CONNECTED_KEY = "lalgeo_survey_dropbox_connected";
const PROJECT_EXTENSIONS = new Set(["lal", "zip"]);
const PROJECT_SCAN_SCOPES = [
  { path: "/LalGeoDB", recursive: true },
  { path: "/Apps/LalGeo", recursive: true },
  { path: "/Apps/LalGeoSurvey", recursive: true },
  // Preserve legacy archives saved directly at the account root without
  // recursively enumerating unrelated folders and files.
  { path: "", recursive: false },
];

function isProjectArchiveName(name = "", path = "") {
  const value = String(name || path).toLowerCase();
  return value.endsWith(".lal") || value.endsWith(".zip");
}

function getSdk() {
  const ctor = globalThis.Dropbox?.Dropbox;
  if (!ctor) {
    throw new Error("Dropbox SDK failed to load.");
  }
  return ctor;
}

export class DropboxConflictError extends Error {
  constructor(message, latestRev = null) {
    super(message);
    this.name = "DropboxConflictError";
    this.latestRev = latestRev;
  }
}

export class LalGeoDropboxClient {
  constructor(options = {}) {
    this.folderPath = options.folderPath || "/LalGeoDB";
    this.versionsPath = `${this.folderPath}/_versions`;
    this.accessToken = options.accessToken || readStoredDropboxToken();
    this.profile = null;
    this.resumableThreshold = options.resumableThreshold || DEFAULT_RESUMABLE_THRESHOLD;
    this.chunkSize = options.chunkSize;
  }

  setAccessToken(token, persist = true) {
    this.accessToken = token || "";
    if (persist && token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.setItem(TOKEN_STORAGE_SESSION_KEY, token);
    }
  }

  clearAccessToken() {
    this.accessToken = "";
    this.profile = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_SESSION_KEY);
    localStorage.removeItem("dropboxAccessToken");
    sessionStorage.removeItem("dropboxAccessToken");
    localStorage.removeItem(SURVEY_DROPBOX_CONNECTED_KEY);
  }

  async logout() {
    this.clearAccessToken();
    try {
      await fetch(`${WORKER_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Clearing local auth state is still useful even if the worker is unavailable.
    }
  }

  get isReady() {
    return Boolean(this.accessToken);
  }

  get client() {
    if (!this.accessToken) {
      throw new Error("Dropbox access token missing.");
    }
    const DropboxCtor = getSdk();
    const browserFetch = (...args) => globalThis.fetch(...args);
    return new DropboxCtor({ accessToken: this.accessToken, fetch: browserFetch });
  }

  async connectWithExistingSurveySession() {
    const tokenFromUrl = consumeDropboxTokenFromUrl();
    if (tokenFromUrl) {
      this.setAccessToken(tokenFromUrl, true);
      localStorage.setItem(SURVEY_DROPBOX_CONNECTED_KEY, "1");
      return { tokenBridged: true, surveyConnected: true };
    }
    const workerProfile = await this.fetchWorkerProfile();
    if (workerProfile) {
      this.profile = workerProfile;
      localStorage.setItem(SURVEY_DROPBOX_CONNECTED_KEY, "1");
    }
    return {
      tokenBridged: false,
      surveyConnected: Boolean(workerProfile),
    };
  }

  async fetchWorkerProfile() {
    try {
      const response = await fetch(`${WORKER_BASE}/api/profile`, { credentials: "include" });
      if (!response.ok) return null;
      const data = await response.json();
      if (data?.connected) {
        this.profile = data.profile || null;
      }
      return data?.connected ? (data.profile || {}) : null;
    } catch {
      return null;
    }
  }

  startOauth(returnTo = window.location.href, options = {}) {
    const nextUrl = new URL(returnTo);
    nextUrl.searchParams.set("dropboxReturn", "1");
    if (options.bridgeAttempted) {
      nextUrl.searchParams.set("dropboxBridgeAttempted", "1");
    }
    window.location.href = `${WORKER_BASE}/api/auth?returnTo=${encodeURIComponent(nextUrl.toString())}`;
  }

  async ensureFolderStructure() {
    await this.ensureFolder(this.folderPath);
    await this.ensureFolder(this.versionsPath);
  }

  async ensureFolder(path) {
    try {
      await this.client.filesGetMetadata({ path });
    } catch (error) {
      if (String(error?.error || error?.message || "").includes("not_found")) {
        await this.client.filesCreateFolderV2({ path, autorename: false });
        return;
      }
      const tag = error?.error?.error_summary || error?.status;
      if (String(tag).includes("not_found")) {
        await this.client.filesCreateFolderV2({ path, autorename: false });
        return;
      }
      throw error;
    }
  }

  async listLayers() {
    try {
      return await this.listLayersFromWorker();
    } catch (workerError) {
      console.warn("Worker project list failed; falling back to Dropbox SDK listing.", workerError);
    }
    await this.ensureFolderStructure();
    return this.listLayersViaSdk();
  }

  async listLayersFromWorker() {
    const response = await fetch(`${WORKER_BASE}/api/surveys/list`, { credentials: "include" });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "Connect your Dropbox account to list files." : "Unable to list Dropbox project files.");
    }
    const data = await response.json();
    const rows = (data.entries || [])
      .filter((entry) => entry[".tag"] === "file" && isProjectArchiveName(entry.name || "", entry.path_display || entry.path_lower || ""))
      .filter((entry) => !String(entry.path_lower || "").toLowerCase().includes("/_versions/"))
      .map((entry) => ({
        id: entry.id || entry.path_lower || entry.path_display || entry.name,
        pathLower: String(entry.path_lower || "").toLowerCase(),
        pathDisplay: entry.path_display || entry.path_lower || entry.name,
        name: entry.name,
        serverModified: entry.server_modified,
        clientModified: entry.client_modified,
        rev: entry.rev,
        size: entry.size,
        fileType: String(entry.name || "").split(".").pop()?.toLowerCase() || "",
      }));
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async listLayersViaSdk() {
    const client = this.client;
    const unwrap = (response) => response.result || response;
    const catalog = await collectCloudFiles({
      async list(scope) {
        const result = unwrap(await client.filesListFolder({ path: scope.path, recursive: scope.recursive }));
        return { entries: result.entries, hasMore: result.has_more, cursor: result.cursor };
      },
      async continue(cursor) {
        const result = unwrap(await client.filesListFolderContinue({ cursor }));
        return { entries: result.entries, hasMore: result.has_more, cursor: result.cursor };
      },
      isMissingScope(error) {
        const summary = String(error?.error?.error_summary || error?.message || error?.status || "");
        return summary.includes("not_found");
      },
    }, {
      scopes: PROJECT_SCAN_SCOPES,
      accept: (entry) => {
        if (entry[".tag"] !== "file") return false;
        const pathLower = String(entry.path_lower || "").toLowerCase();
        if (!pathLower || pathLower.startsWith(`${this.versionsPath.toLowerCase()}/`)) return false;
        return PROJECT_EXTENSIONS.has(String(entry.name || "").split(".").pop()?.toLowerCase() || "");
      },
      mapEntry: (entry) => ({
        id: entry.id,
        pathLower: String(entry.path_lower || "").toLowerCase(),
        pathDisplay: entry.path_display,
        name: entry.name,
        serverModified: entry.server_modified,
        clientModified: entry.client_modified,
        rev: entry.rev,
        size: entry.size,
        fileType: String(entry.name || "").split(".").pop()?.toLowerCase() || "",
      }),
      keyOf: (row) => row.pathLower,
    });
    const rows = catalog.rows;
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async loadLayer(path) {
    const response = await this.client.filesDownload({ path });
    const result = response.result || response;
    const buffer = await extractArrayBuffer(result.fileBlob || result.fileBinary || response.fileBlob || response.fileBinary);
    const layer = await parseLalArrayBuffer(buffer, result.name || path.split("/").pop() || "layer.lal");
    layer.revision = {
      ...(layer.revision || {}),
      dropboxRev: result.rev || null,
      sourcePath: result.path_display || path,
      lastSyncedAt: new Date().toISOString(),
    };
    layer.metadata.updatedAt = result.server_modified || layer.metadata.updatedAt;
    return { layer, file: result };
  }

  async downloadFile(path) {
    const response = await this.client.filesDownload({ path });
    const result = response.result || response;
    return {
      file: result,
      blob: result.fileBlob || result.fileBinary || response.fileBlob || response.fileBinary,
    };
  }

  async saveLayer(layer, options = {}) {
    const payload = exportLayer(layer, "lal", { pretty: false });
    const path = options.path || layer.revision?.sourcePath || `${this.folderPath}/${payload.fileName}`;
    const previousRev = options.rev || layer.revision?.dropboxRev || null;
    await this.ensureFolderStructure();
    if (previousRev) {
      await this.writeVersionSnapshot(path, previousRev);
    }
    const contents = new Blob([payload.contents], { type: payload.mimeType });
    try {
      const mode = previousRev ? { ".tag": "update", update: previousRev } : { ".tag": "add" };
      if (contents.size >= this.resumableThreshold) {
        return await this.uploadLargeFile(contents, { path, mode, autorename: !previousRev });
      }
      const response = await this.client.filesUpload({
        path,
        contents,
        mode,
        autorename: !previousRev,
        mute: false,
      });
      return response.result || response;
    } catch (error) {
      if (String(error?.error?.error_summary || error?.message || "").includes("conflict")) {
        const latest = await this.tryGetMetadata(path);
        throw new DropboxConflictError("The layer changed in Dropbox since you opened it.", latest?.rev || null);
      }
      throw error;
    }
  }

  async uploadLargeFile(contents, commit) {
    const client = this.client;
    const adapter = {
      async start(chunk) {
        const response = await client.filesUploadSessionStart({ close: false, contents: chunk });
        const result = response.result || response;
        return { sessionId: result.session_id };
      },
      async append(sessionId, offset, chunk) {
        await client.filesUploadSessionAppendV2({
          cursor: { session_id: sessionId, offset },
          close: false,
          contents: chunk,
        });
      },
      async finish(sessionId, offset, chunk, nextCommit) {
        const response = await client.filesUploadSessionFinish({
          cursor: { session_id: sessionId, offset },
          commit: { ...nextCommit, mute: false },
          contents: chunk,
        });
        return response.result || response;
      },
      async lookupOffset(sessionId) {
        try {
          await client.filesUploadSessionAppendV2({
            cursor: { session_id: sessionId, offset: Number.MAX_SAFE_INTEGER },
            close: false,
            contents: new Blob([]),
          });
          return Number.MAX_SAFE_INTEGER;
        } catch (error) {
          const correctOffset = error?.error?.error?.correct_offset
            ?? error?.error?.correct_offset
            ?? error?.correct_offset;
          if (Number.isSafeInteger(correctOffset)) return correctOffset;
          throw normalizeCloudError(error, "dropbox");
        }
      },
    };
    return uploadBlobResumably(adapter, contents, {
      commit,
      chunkSize: this.chunkSize,
      provider: "dropbox",
    });
  }

  async writeVersionSnapshot(path, rev) {
    try {
      const download = await this.client.filesDownload({ path });
      const result = download.result || download;
      const extension = path.split(".").pop() || "lal";
      const baseName = slugify(result.name?.replace(/\.lal$/i, "") || "layer");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const versionPath = `${this.versionsPath}/${baseName}--${stamp}--${rev}.${extension}`;
      const blob = result.fileBlob || result.fileBinary;
      await this.client.filesUpload({
        path: versionPath,
        contents: blob,
        mode: { ".tag": "add" },
        autorename: true,
        mute: true,
      });
    } catch {
      // Version snapshots are best-effort; save should still continue.
    }
  }

  async renameLayer(path, nextName) {
    const extension = nextName.toLowerCase().endsWith(".lal") ? "" : ".lal";
    const target = `${this.folderPath}/${nextName}${extension}`;
    const response = await this.client.filesMoveV2({
      from_path: path,
      to_path: target,
      autorename: false,
      allow_ownership_transfer: false,
    });
    return response.result?.metadata || response.metadata || null;
  }

  async duplicateLayer(path, nextName) {
    const extension = nextName.toLowerCase().endsWith(".lal") ? "" : ".lal";
    const target = `${this.folderPath}/${nextName}${extension}`;
    const response = await this.client.filesCopyV2({
      from_path: path,
      to_path: target,
      autorename: true,
      allow_ownership_transfer: false,
    });
    return response.result?.metadata || response.metadata || null;
  }

  async deleteLayer(path) {
    const response = await this.client.filesDeleteV2({ path });
    return response.result?.metadata || response.metadata || null;
  }

  async tryGetMetadata(path) {
    try {
      const response = await this.client.filesGetMetadata({ path });
      return response.result || response;
    } catch {
      return null;
    }
  }
}

export function readStoredDropboxToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
    || sessionStorage.getItem(TOKEN_STORAGE_SESSION_KEY)
    || localStorage.getItem("dropboxAccessToken")
    || sessionStorage.getItem("dropboxAccessToken")
    || globalThis.LALGEO_DROPBOX_ACCESS_TOKEN
    || "";
}

export function consumeDropboxTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("dropboxAccessToken") || url.searchParams.get("dbx_access_token");
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    sessionStorage.setItem(TOKEN_STORAGE_SESSION_KEY, token);
    localStorage.setItem("dropboxAccessToken", token);
    sessionStorage.setItem("dropboxAccessToken", token);
    localStorage.setItem(SURVEY_DROPBOX_CONNECTED_KEY, "1");
    url.searchParams.delete("dropboxAccessToken");
    url.searchParams.delete("dbx_access_token");
    window.history.replaceState({}, "", url.toString());
    return token;
  }
  return "";
}

export function getDropboxChooserAppKey() {
  return localStorage.getItem(CHOOSER_APP_KEY_KEY) || globalThis.LALGEO_DROPBOX_CHOOSER_APP_KEY || "";
}

async function extractArrayBuffer(blobLike) {
  if (blobLike instanceof ArrayBuffer) return blobLike;
  if (blobLike?.arrayBuffer) return blobLike.arrayBuffer();
  if (blobLike?.buffer) return blobLike.buffer;
  throw new Error("Unable to read Dropbox file contents.");
}
