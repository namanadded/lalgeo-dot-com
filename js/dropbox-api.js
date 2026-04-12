import { exportLayer, parseLalArrayBuffer, slugify } from "./lal-file.js";

export const WORKER_BASE = "https://dropbox.lalgeo.com";
export const TOKEN_STORAGE_KEY = "lalgeo_dropbox_access_token";
export const TOKEN_STORAGE_SESSION_KEY = "lalgeo_dropbox_access_token_session";
export const CHOOSER_APP_KEY_KEY = "lalgeo_dropbox_chooser_app_key";

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
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_SESSION_KEY);
  }

  get isReady() {
    return Boolean(this.accessToken);
  }

  get client() {
    if (!this.accessToken) {
      throw new Error("Dropbox access token missing.");
    }
    const DropboxCtor = getSdk();
    return new DropboxCtor({ accessToken: this.accessToken, fetch });
  }

  async connectWithExistingSurveySession() {
    const tokenFromUrl = consumeDropboxTokenFromUrl();
    if (tokenFromUrl) {
      this.setAccessToken(tokenFromUrl, true);
      return { tokenBridged: true };
    }
    const workerProfile = await this.fetchWorkerProfile();
    if (workerProfile) {
      this.profile = workerProfile;
    }
    if (!this.accessToken) {
      throw new Error("Dropbox is authenticated in Survey, but the Data Manager still needs an access-token bridge.");
    }
    return { tokenBridged: false };
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

  startOauth(returnTo = window.location.href) {
    const nextUrl = new URL(returnTo);
    nextUrl.searchParams.set("dropboxReturn", "1");
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
    await this.ensureFolderStructure();
    let cursor = null;
    const rows = [];
    do {
      const response = cursor
        ? await this.client.filesListFolderContinue({ cursor })
        : await this.client.filesListFolder({ path: this.folderPath });
      const entries = response.result?.entries || response.entries || [];
      entries.forEach((entry) => {
        if (entry[".tag"] !== "file") return;
        if (!String(entry.name || "").toLowerCase().endsWith(".lal")) return;
        rows.push({
          id: entry.id,
          pathLower: entry.path_lower,
          pathDisplay: entry.path_display,
          name: entry.name,
          serverModified: entry.server_modified,
          clientModified: entry.client_modified,
          rev: entry.rev,
          size: entry.size,
        });
      });
      cursor = (response.result?.has_more || response.has_more) ? (response.result?.cursor || response.cursor) : null;
    } while (cursor);
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

  async saveLayer(layer, options = {}) {
    const payload = exportLayer(layer, "lal");
    const path = options.path || layer.revision?.sourcePath || `${this.folderPath}/${payload.fileName}`;
    const previousRev = options.rev || layer.revision?.dropboxRev || null;
    await this.ensureFolderStructure();
    if (previousRev) {
      await this.writeVersionSnapshot(path, previousRev);
    }
    const contents = new Blob([payload.contents], { type: payload.mimeType });
    try {
      const mode = previousRev ? { ".tag": "update", update: previousRev } : { ".tag": "add" };
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
  return localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_SESSION_KEY) || globalThis.LALGEO_DROPBOX_ACCESS_TOKEN || "";
}

export function consumeDropboxTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("dropboxAccessToken") || url.searchParams.get("dbx_access_token");
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    sessionStorage.setItem(TOKEN_STORAGE_SESSION_KEY, token);
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

