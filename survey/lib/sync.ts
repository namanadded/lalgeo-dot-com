import path from "path";
import {
  ensureDir,
  readJson,
  storageRoot,
  writeJson,
} from "./storage";

export type SyncTargetType = "agol" | "portal" | "fileGdb" | "sde";
export type SyncMode = "instant" | "scheduled" | "both";
export type SyncAttachmentMode = "attachments" | "urls";
export type SyncRunStatus = "queued" | "running" | "success" | "failed" | "dry-run";
export type SyncTrigger = "manual" | "webhook" | "schedule";

export interface FieldMapping {
  source: string;
  target: string;
  type?: string;
  required?: boolean;
}

export interface SyncConnectionDraft {
  name: string;
  dropboxProjectPath: string;
  dropboxProjectLabel?: string;
  sourceCsvPattern?: string;
  targetType: SyncTargetType;
  targetConfig: Record<string, string | number | boolean | null>;
  auth: {
    type: "token" | "basic" | "oauth" | "sde" | "none";
    token?: string;
    username?: string;
    password?: string;
    note?: string;
  };
  fieldMapping: FieldMapping[];
  latField: string;
  lonField: string;
  idField: string;
  idStrategy: "asset_id" | "lalgeo_guid";
  syncMode: SyncMode;
  scheduleCron?: string;
  scheduleTz?: string;
  attachmentsMode: SyncAttachmentMode;
  softDeleteField?: string;
  dryRunDefault?: boolean;
}

export interface SyncConnection extends SyncConnectionDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastSyncStatus?: SyncRunStatus;
  lastSyncSummary?: string;
}

export interface SyncRun {
  id: string;
  connectionId: string;
  triggeredBy: SyncTrigger;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  stats: {
    adds: number;
    updates: number;
    deletes: number;
    skipped: number;
    attachments: number;
  };
}

export interface SyncLog {
  id: string;
  connectionId: string;
  runId: string;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
  context?: Record<string, unknown>;
}

export interface SyncCursor {
  connectionId: string;
  dropboxCursor: string;
  revision?: string;
  updatedAt: string;
}

export interface SyncValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const SYNC_ROOT = path.join(storageRoot(), "sync");
const CONNECTIONS_PATH = path.join(SYNC_ROOT, "connections.json");
const RUNS_PATH = path.join(SYNC_ROOT, "runs.json");
const LOGS_PATH = path.join(SYNC_ROOT, "logs.json");
const CURSORS_PATH = path.join(SYNC_ROOT, "cursors.json");

function ensureSyncLayout() {
  ensureDir(SYNC_ROOT);
}

function readConnections(): SyncConnection[] {
  ensureSyncLayout();
  return readJson<SyncConnection[]>(CONNECTIONS_PATH, []);
}

function writeConnections(connections: SyncConnection[]) {
  writeJson(CONNECTIONS_PATH, connections);
}

function readRuns(): SyncRun[] {
  ensureSyncLayout();
  return readJson<SyncRun[]>(RUNS_PATH, []);
}

function writeRuns(runs: SyncRun[]) {
  writeJson(RUNS_PATH, runs);
}

function readLogs(): SyncLog[] {
  ensureSyncLayout();
  return readJson<SyncLog[]>(LOGS_PATH, []);
}

function writeLogs(logs: SyncLog[]) {
  writeJson(LOGS_PATH, logs);
}

function readCursors(): SyncCursor[] {
  ensureSyncLayout();
  return readJson<SyncCursor[]>(CURSORS_PATH, []);
}

function writeCursors(cursors: SyncCursor[]) {
  writeJson(CURSORS_PATH, cursors);
}

export function listSyncConnections(): SyncConnection[] {
  return readConnections();
}

export function getSyncConnection(id: string): SyncConnection | undefined {
  return readConnections().find((conn) => conn.id === id);
}

export function validateSyncConnection(draft: SyncConnectionDraft): SyncValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!draft.name.trim()) errors.push("Connection name is required.");
  if (!draft.dropboxProjectPath.trim()) errors.push("Dropbox project path is required.");
  if (!draft.latField.trim() || !draft.lonField.trim()) {
    errors.push("Latitude and longitude fields are required for point geometry.");
  }
  if (!draft.idField.trim()) errors.push("A stable id field is required for idempotent upserts.");
  if (!draft.targetType) errors.push("A target type must be selected.");
  if (draft.targetType === "agol") {
    if (!draft.targetConfig.itemId) errors.push("ArcGIS Online item ID is required.");
    if (!draft.targetConfig.layerId) errors.push("ArcGIS Online layer ID is required.");
  }
  if (draft.targetType === "portal") {
    if (!draft.targetConfig.portalUrl) errors.push("Portal URL is required.");
    if (!draft.targetConfig.serviceUrl) errors.push("Referenced feature service URL is required.");
  }
  if (draft.targetType === "fileGdb") {
    if (!draft.targetConfig.fileGdbPath) errors.push("File Geodatabase path is required.");
    if (!draft.targetConfig.featureClass) errors.push("Target feature class name is required.");
  }
  if (draft.targetType === "sde") {
    if (!draft.targetConfig.sdeConnectionPath) errors.push("SDE connection file path is required.");
    if (!draft.targetConfig.featureClass) errors.push("Target feature class name is required.");
  }
  if (draft.syncMode === "scheduled" || draft.syncMode === "both") {
    if (!draft.scheduleCron?.trim()) errors.push("A cron schedule is required for scheduled sync.");
    if (!draft.scheduleTz?.trim()) warnings.push("Timezone not set; defaulting to server time.");
  }
  if (draft.attachmentsMode === "attachments") {
    warnings.push("Attachments require ArcGIS feature layer attachment support.");
  }
  if (draft.auth.type === "none") {
    warnings.push("No authentication configured; sync will fail for secured targets.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function createSyncConnection(draft: SyncConnectionDraft): SyncConnection {
  const now = new Date().toISOString();
  const connection: SyncConnection = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    lastSyncStatus: "queued",
  };
  const connections = readConnections();
  connections.push(connection);
  writeConnections(connections);
  return connection;
}

export function updateSyncConnection(id: string, updates: Partial<SyncConnection>) {
  const connections = readConnections();
  const idx = connections.findIndex((conn) => conn.id === id);
  if (idx === -1) return;
  connections[idx] = {
    ...connections[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  writeConnections(connections);
}

export function createSyncRun(input: Omit<SyncRun, "id" | "startedAt" | "status"> & { status?: SyncRunStatus }): SyncRun {
  const now = new Date().toISOString();
  const run: SyncRun = {
    id: crypto.randomUUID(),
    startedAt: now,
    status: input.status || "queued",
    ...input,
  };
  const runs = readRuns();
  runs.push(run);
  writeRuns(runs);
  return run;
}

export function updateSyncRun(id: string, updates: Partial<SyncRun>) {
  const runs = readRuns();
  const idx = runs.findIndex((run) => run.id === id);
  if (idx === -1) return;
  runs[idx] = {
    ...runs[idx],
    ...updates,
  };
  writeRuns(runs);
}

export function appendSyncLog(entry: Omit<SyncLog, "id" | "at">): SyncLog {
  const log: SyncLog = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
  const logs = readLogs();
  logs.push(log);
  writeLogs(logs);
  return log;
}

export function listSyncLogs(connectionId: string): SyncLog[] {
  const logs = readLogs();
  return logs
    .filter((log) => log.connectionId === connectionId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function listSyncRuns(connectionId: string): SyncRun[] {
  const runs = readRuns();
  return runs
    .filter((run) => run.connectionId === connectionId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function upsertSyncCursor(cursor: SyncCursor) {
  const cursors = readCursors();
  const idx = cursors.findIndex((item) => item.connectionId === cursor.connectionId);
  if (idx === -1) {
    cursors.push(cursor);
  } else {
    cursors[idx] = cursor;
  }
  writeCursors(cursors);
}

export function getSyncCursor(connectionId: string): SyncCursor | undefined {
  return readCursors().find((cursor) => cursor.connectionId === connectionId);
}

export function summarizeRun(stats: SyncRun["stats"], dryRun: boolean): string {
  const prefix = dryRun ? "Dry run" : "Sync";
  return `${prefix}: ${stats.adds} adds, ${stats.updates} updates, ${stats.deletes} deletes`;
}
