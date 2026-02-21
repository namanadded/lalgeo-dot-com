import fs from "fs";
import os from "os";
import path from "path";

const DEFAULT_STORAGE_ROOT = "/Volumes/LALGEO_CLOUD/surveys";

function resolveStorageRoot(): string {
  if (process.env.LALGEO_STORAGE_ROOT) return process.env.LALGEO_STORAGE_ROOT;
  // Prefer local mounted volume when available, otherwise fall back to /tmp for serverless hosts.
  if (fs.existsSync(DEFAULT_STORAGE_ROOT)) return DEFAULT_STORAGE_ROOT;
  return path.join(os.tmpdir(), "lalgeo-surveys");
}

const STORAGE_ROOT = resolveStorageRoot();

export const MAX_SURVEY_BYTES = 100 * 1024 * 1024;

export function storageRoot(): string {
  return STORAGE_ROOT;
}

export function surveyDir(id: string): string {
  return path.join(storageRoot(), "surveys", id);
}

export function surveyUploadsDir(id: string): string {
  return path.join(surveyDir(id), "uploads");
}

export function authDir(): string {
  return path.join(storageRoot(), "auth");
}

export function indexPath(): string {
  return path.join(storageRoot(), "index.json");
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureStorageLayout() {
  ensureDir(storageRoot());
  ensureDir(path.join(storageRoot(), "surveys"));
  ensureDir(authDir());
}

export function readJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

export function ensureSurveyDirs(id: string) {
  ensureDir(surveyDir(id));
  ensureDir(surveyUploadsDir(id));
}

export function dirSizeBytes(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return stats.size;
  if (!stats.isDirectory()) return 0;
  const entries = fs.readdirSync(targetPath);
  let total = 0;
  for (const entry of entries) {
    total += dirSizeBytes(path.join(targetPath, entry));
  }
  return total;
}

export function enforceSurveyCap(id: string, incomingBytes = 0) {
  const current = dirSizeBytes(surveyDir(id));
  if (current + incomingBytes > MAX_SURVEY_BYTES) {
    const err = new Error("Survey storage limit exceeded (100 MB). Remove files or start a new survey.");
    (err as Error & { code?: string }).code = "LIMIT_EXCEEDED";
    throw err;
  }
}
