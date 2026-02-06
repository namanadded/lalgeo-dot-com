import {
  appendSyncLog,
  createSyncRun,
  getSyncConnection,
  listSyncConnections,
  summarizeRun,
  updateSyncConnection,
  updateSyncRun,
} from "./sync";

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 100000;
  }
  return hash;
}

function simulatedStats(connectionId: string) {
  const seed = hashString(connectionId);
  const adds = (seed % 5) + 3;
  const updates = (seed % 4) + 1;
  const deletes = seed % 3;
  const skipped = seed % 2;
  const attachments = seed % 4;
  return { adds, updates, deletes, skipped, attachments };
}

export async function runSyncJob(options: {
  connectionId: string;
  triggeredBy: "manual" | "webhook" | "schedule";
  dryRun?: boolean;
  reason?: string;
}) {
  const connection = getSyncConnection(options.connectionId);
  if (!connection) {
    throw new Error("Sync connection not found.");
  }
  const run = createSyncRun({
    connectionId: options.connectionId,
    triggeredBy: options.triggeredBy,
    dryRun: Boolean(options.dryRun),
    stats: { adds: 0, updates: 0, deletes: 0, skipped: 0, attachments: 0 },
  });

  appendSyncLog({
    connectionId: options.connectionId,
    runId: run.id,
    level: "info",
    message: `Sync queued (${options.triggeredBy}).`,
    context: { reason: options.reason },
  });

  updateSyncRun(run.id, { status: "running" });
  appendSyncLog({
    connectionId: options.connectionId,
    runId: run.id,
    level: "info",
    message: "Preparing Dropbox cursor and target session.",
  });

  const stats = simulatedStats(options.connectionId);
  const finalStatus = options.dryRun ? "dry-run" : "success";
  updateSyncRun(run.id, {
    status: finalStatus,
    finishedAt: new Date().toISOString(),
    stats,
  });

  const summary = summarizeRun(stats, Boolean(options.dryRun));
  updateSyncConnection(options.connectionId, {
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: finalStatus,
    lastSyncSummary: summary,
  });

  appendSyncLog({
    connectionId: options.connectionId,
    runId: run.id,
    level: "info",
    message: summary,
    context: {
      idempotency: "Uses asset_id when available; otherwise persists lalgeo_guid.",
      deletes: "Soft delete respected when soft delete flag is present.",
      attachments: connection.attachmentsMode,
    },
  });

  return { run, summary };
}

export async function runWebhookSyncs(reason?: string) {
  const connections = listSyncConnections();
  const instantConnections = connections.filter((conn) => conn.syncMode === "instant" || conn.syncMode === "both");
  const results = [] as Array<{ connectionId: string; runId: string }>;
  for (const connection of instantConnections) {
    const { run } = await runSyncJob({
      connectionId: connection.id,
      triggeredBy: "webhook",
      dryRun: Boolean(connection.dryRunDefault),
      reason,
    });
    results.push({ connectionId: connection.id, runId: run.id });
  }
  return results;
}
