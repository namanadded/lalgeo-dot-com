"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SyncTargetType = "agol" | "portal" | "fileGdb" | "sde";

type SyncMode = "instant" | "scheduled" | "both";

type SyncAttachmentMode = "attachments" | "urls";

interface FieldMapping {
  source: string;
  target: string;
  type?: string;
  required?: boolean;
}

interface SyncConnectionDraft {
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

interface SyncConnection extends SyncConnectionDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncSummary?: string;
}

interface SyncLog {
  id: string;
  connectionId: string;
  runId: string;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
  context?: Record<string, unknown>;
}

interface SyncRun {
  id: string;
  status: string;
  triggeredBy: string;
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

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const stepLabels = [
  "Project",
  "Target",
  "Auth",
  "Mapping",
  "Schedule",
  "Review",
];

const targetCards: Array<{ type: SyncTargetType; title: string; detail: string }> = [
  {
    type: "agol",
    title: "ArcGIS Online",
    detail: "Hosted feature layer",
  },
  {
    type: "portal",
    title: "Enterprise Portal",
    detail: "Referenced feature service (SDE-backed)",
  },
  {
    type: "fileGdb",
    title: "File Geodatabase",
    detail: "Direct write to .gdb",
  },
  {
    type: "sde",
    title: "Enterprise SDE",
    detail: "Direct write via .sde connection",
  },
];

const defaultDraft: SyncConnectionDraft = {
  name: "",
  dropboxProjectPath: "",
  dropboxProjectLabel: "",
  sourceCsvPattern: "*.csv",
  targetType: "agol",
  targetConfig: {
    itemId: "",
    layerId: "0",
    portalUrl: "",
    serviceUrl: "",
    fileGdbPath: "",
    sdeConnectionPath: "",
    featureClass: "",
  },
  auth: {
    type: "token",
    token: "",
    username: "",
    password: "",
  },
  fieldMapping: [
    { source: "asset_id", target: "asset_id" },
    { source: "status", target: "status" },
  ],
  latField: "latitude",
  lonField: "longitude",
  idField: "asset_id",
  idStrategy: "asset_id",
  syncMode: "instant",
  scheduleCron: "0 * * * *",
  scheduleTz: "America/Los_Angeles",
  attachmentsMode: "attachments",
  softDeleteField: "is_deleted",
  dryRunDefault: false,
};

function formatDate(value?: string) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function statusClass(status?: string) {
  if (!status) return "status-pill";
  if (status === "success") return "status-pill success";
  if (status === "failed") return "status-pill error";
  if (status === "dry-run") return "status-pill warn";
  return "status-pill";
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SyncConnectionDraft>({ ...defaultDraft });
  const [testResult, setTestResult] = useState<ValidationResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const selectedConnection = useMemo(
    () => connections.find((conn) => conn.id === selectedId) || null,
    [connections, selectedId]
  );

  const loadConnections = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/survey/api/sync/connections");
    if (res.status === 401) {
      router.replace("/survey/login");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setConnections(data.connections || []);
    setLoading(false);
  };

  const loadLogs = async (connectionId: string) => {
    const res = await fetch(`/survey/api/sync/logs?connectionId=${connectionId}`);
    const data = await res.json().catch(() => ({}));
    setLogs(data.logs || []);
    setRuns(data.runs || []);
  };

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadLogs(selectedId);
    }
  }, [selectedId]);

  const updateDraft = (patch: Partial<SyncConnectionDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const updateTargetConfig = (key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      targetConfig: { ...prev.targetConfig, [key]: value },
    }));
  };

  const updateAuth = (key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      auth: { ...prev.auth, [key]: value },
    }));
  };

  const updateMapping = (index: number, patch: Partial<FieldMapping>) => {
    setDraft((prev) => {
      const updated = [...prev.fieldMapping];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, fieldMapping: updated };
    });
  };

  const addMapping = () => {
    setDraft((prev) => ({
      ...prev,
      fieldMapping: [...prev.fieldMapping, { source: "", target: "" }],
    }));
  };

  const removeMapping = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      fieldMapping: prev.fieldMapping.filter((_, idx) => idx !== index),
    }));
  };

  const startWizard = () => {
    setDraft({ ...defaultDraft });
    setStep(0);
    setTestResult(null);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/survey/api/sync/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validateOnly: true, connection: draft }),
    });
    const data = await res.json().catch(() => ({}));
    setTestResult(data.validation || null);
    setTesting(false);
  };

  const createConnection = async () => {
    setCreating(true);
    setError(null);
    const res = await fetch("/survey/api/sync/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection: draft }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to create connection.");
      setTestResult(data.validation || null);
      setCreating(false);
      return;
    }
    setWizardOpen(false);
    setCreating(false);
    await loadConnections();
  };

  const runNow = async (connectionId: string, dryRun = false) => {
    setRunning((prev) => ({ ...prev, [connectionId]: true }));
    setError(null);
    const res = await fetch("/survey/api/sync/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, dryRun }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Sync failed.");
      setRunning((prev) => ({ ...prev, [connectionId]: false }));
      return;
    }
    await loadConnections();
    if (selectedId === connectionId) {
      await loadLogs(connectionId);
    }
    setRunning((prev) => ({ ...prev, [connectionId]: false }));
  };

  return (
    <main className="integrations">
      <div className="shell">
        <div className="integrations-header">
          <div>
            <div className="integrations-title">Sync Integrations</div>
            <div className="integrations-subtitle">Connect Dropbox surveys to ArcGIS targets with instant or scheduled sync.</div>
          </div>
          <div className="integrations-actions">
            <button className="apple-button secondary" onClick={() => router.push("/survey/dashboard")}>Back to dashboard</button>
            <button className="apple-button" onClick={startWizard}>Add integration</button>
          </div>
        </div>

        {error && (
          <div className="integrations-card">
            <div className="status-pill error">{error}</div>
          </div>
        )}

        <div className="integrations-card">
          <div className="integration-row" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Connections</div>
              <div className="apple-muted">Instant and scheduled syncs for LalGeo Survey Dropbox projects.</div>
            </div>
            <div className="apple-muted">{loading ? "Loading…" : `${connections.length} total`}</div>
          </div>
          <div className="integrations-grid">
            {connections.length === 0 && (
              <div className="apple-muted">No sync connections yet. Add one to start syncing.</div>
            )}
            {connections.map((connection) => (
              <div key={connection.id} className="integrations-card" style={{ borderRadius: 16 }}>
                <div className="integration-row">
                  <div className="integration-meta">
                    <div style={{ fontWeight: 600 }}>{connection.name}</div>
                    <div className="apple-muted">{connection.dropboxProjectPath}</div>
                    <div className="apple-muted">
                      Target: {connection.targetType.toUpperCase()} · Mode: {connection.syncMode}
                    </div>
                  </div>
                  <div className={statusClass(connection.lastSyncStatus)}>
                    {connection.lastSyncStatus || "idle"}
                  </div>
                </div>
                <div className="integration-row" style={{ marginTop: 12 }}>
                  <div className="apple-muted">Last sync: {formatDate(connection.lastSyncAt)}</div>
                  <div className="integration-actions">
                    <button
                      className="apple-button secondary"
                      onClick={() => setSelectedId(connection.id)}
                    >
                      View logs
                    </button>
                    <button
                      className="apple-button secondary"
                      disabled={running[connection.id]}
                      onClick={() => runNow(connection.id, true)}
                    >
                      {running[connection.id] ? "Running…" : "Dry run"}
                    </button>
                    <button
                      className="apple-button"
                      disabled={running[connection.id]}
                      onClick={() => runNow(connection.id, false)}
                    >
                      {running[connection.id] ? "Running…" : "Run now"}
                    </button>
                  </div>
                </div>
                {connection.lastSyncSummary && (
                  <div className="apple-muted" style={{ marginTop: 10 }}>{connection.lastSyncSummary}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="integrations-card">
          <div className="integration-row" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Recent logs</div>
              <div className="apple-muted">Detailed event history for the selected connection.</div>
            </div>
            {selectedConnection && (
              <div className="apple-muted">{selectedConnection.name}</div>
            )}
          </div>
          {!selectedConnection && (
            <div className="apple-muted">Select a connection to view logs and run history.</div>
          )}
          {selectedConnection && (
            <div className="integrations-grid two">
              <div className="integrations-card" style={{ borderRadius: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Run history</div>
                <div className="log-list">
                  {runs.length === 0 && <div className="apple-muted">No runs yet.</div>}
                  {runs.map((run) => (
                    <div key={run.id} className="log-item">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 600 }}>{run.dryRun ? "Dry run" : "Sync run"}</div>
                        <div className={statusClass(run.status)}>{run.status}</div>
                      </div>
                      <div className="log-meta">Started {formatDate(run.startedAt)}</div>
                      <div className="log-meta">
                        Adds {run.stats.adds} · Updates {run.stats.updates} · Deletes {run.stats.deletes}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="integrations-card" style={{ borderRadius: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Logs</div>
                <div className="log-list">
                  {logs.length === 0 && <div className="apple-muted">No logs yet.</div>}
                  {logs.map((log) => (
                    <div key={log.id} className={`log-item ${log.level}`}>
                      <div style={{ fontWeight: 600 }}>{log.message}</div>
                      <div className="log-meta">{formatDate(log.at)} · {log.level.toUpperCase()}</div>
                      {log.context && (
                        <div className="log-meta">{JSON.stringify(log.context)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {wizardOpen && (
        <div className="wizard-overlay">
          <div className="wizard-panel">
            <div className="integration-row" style={{ marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 18 }}>New sync integration</div>
                <div className="apple-muted">Step {step + 1} of {stepLabels.length}</div>
              </div>
              <button className="apple-button ghost" onClick={closeWizard}>Close</button>
            </div>

            <div className="wizard-steps">
              {stepLabels.map((label, index) => (
                <div
                  key={label}
                  className={`wizard-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="wizard-body">
              {step === 0 && (
                <div className="integrations-grid two">
                  <div>
                    <label className="apple-label">Connection name</label>
                    <input
                      className="apple-input"
                      value={draft.name}
                      onChange={(e) => updateDraft({ name: e.target.value })}
                      placeholder="Pacific Crest Survey Sync"
                    />
                  </div>
                  <div>
                    <label className="apple-label">Dropbox project label</label>
                    <input
                      className="apple-input"
                      value={draft.dropboxProjectLabel || ""}
                      onChange={(e) => updateDraft({ dropboxProjectLabel: e.target.value })}
                      placeholder="Laguna Ridge Survey"
                    />
                  </div>
                  <div>
                    <label className="apple-label">Dropbox project path</label>
                    <input
                      className="apple-input"
                      value={draft.dropboxProjectPath}
                      onChange={(e) => updateDraft({ dropboxProjectPath: e.target.value })}
                      placeholder="/Apps/LalGeoSurvey/Projects/Laguna Ridge"
                    />
                    <div className="apple-muted" style={{ marginTop: 6 }}>Use the Dropbox folder that contains the CSV exports.</div>
                  </div>
                  <div>
                    <label className="apple-label">CSV file pattern</label>
                    <input
                      className="apple-input"
                      value={draft.sourceCsvPattern || ""}
                      onChange={(e) => updateDraft({ sourceCsvPattern: e.target.value })}
                      placeholder="responses/*.csv"
                    />
                    <div className="apple-muted" style={{ marginTop: 6 }}>Supports glob patterns for multi-file projects.</div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="integrations-grid two">
                  {targetCards.map((card) => (
                    <button
                      key={card.type}
                      className={`integrations-card ${draft.targetType === card.type ? "selected" : ""}`}
                      style={{ textAlign: "left", cursor: "pointer" }}
                      onClick={() => updateDraft({ targetType: card.type })}
                      type="button"
                    >
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{card.title}</div>
                      <div className="apple-muted" style={{ marginTop: 6 }}>{card.detail}</div>
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="integrations-grid two">
                  <div>
                    <label className="apple-label">Target configuration</label>
                    {draft.targetType === "agol" && (
                      <div className="integrations-grid">
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.itemId || "")}
                          onChange={(e) => updateTargetConfig("itemId", e.target.value)}
                          placeholder="ArcGIS Online item ID"
                        />
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.layerId || "")}
                          onChange={(e) => updateTargetConfig("layerId", e.target.value)}
                          placeholder="Layer ID (ex: 0)"
                        />
                      </div>
                    )}
                    {draft.targetType === "portal" && (
                      <div className="integrations-grid">
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.portalUrl || "")}
                          onChange={(e) => updateTargetConfig("portalUrl", e.target.value)}
                          placeholder="https://portal.company.com/portal"
                        />
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.serviceUrl || "")}
                          onChange={(e) => updateTargetConfig("serviceUrl", e.target.value)}
                          placeholder="https://.../FeatureServer/0"
                        />
                      </div>
                    )}
                    {draft.targetType === "fileGdb" && (
                      <div className="integrations-grid">
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.fileGdbPath || "")}
                          onChange={(e) => updateTargetConfig("fileGdbPath", e.target.value)}
                          placeholder="/Volumes/GIS/Projects/Survey.gdb"
                        />
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.featureClass || "")}
                          onChange={(e) => updateTargetConfig("featureClass", e.target.value)}
                          placeholder="Feature class name"
                        />
                      </div>
                    )}
                    {draft.targetType === "sde" && (
                      <div className="integrations-grid">
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.sdeConnectionPath || "")}
                          onChange={(e) => updateTargetConfig("sdeConnectionPath", e.target.value)}
                          placeholder="/Connections/Survey.sde"
                        />
                        <input
                          className="apple-input"
                          value={String(draft.targetConfig.featureClass || "")}
                          onChange={(e) => updateTargetConfig("featureClass", e.target.value)}
                          placeholder="SDE feature class"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="apple-label">Authentication</label>
                    <select
                      className="apple-select"
                      value={draft.auth.type}
                      onChange={(e) => updateAuth("type", e.target.value)}
                    >
                      {draft.targetType === "agol" || draft.targetType === "portal" ? (
                        <>
                          <option value="token">Token</option>
                          <option value="basic">Username + Password</option>
                          <option value="oauth">OAuth (coming soon)</option>
                        </>
                      ) : (
                        <>
                          <option value="sde">Database credentials</option>
                          <option value="none">None</option>
                        </>
                      )}
                    </select>
                    {draft.auth.type === "token" && (
                      <input
                        className="apple-input"
                        value={draft.auth.token || ""}
                        onChange={(e) => updateAuth("token", e.target.value)}
                        placeholder="Paste ArcGIS token"
                        style={{ marginTop: 10 }}
                      />
                    )}
                    {draft.auth.type === "basic" && (
                      <div className="integrations-grid" style={{ marginTop: 10 }}>
                        <input
                          className="apple-input"
                          value={draft.auth.username || ""}
                          onChange={(e) => updateAuth("username", e.target.value)}
                          placeholder="Username"
                        />
                        <input
                          className="apple-input"
                          type="password"
                          value={draft.auth.password || ""}
                          onChange={(e) => updateAuth("password", e.target.value)}
                          placeholder="Password"
                        />
                      </div>
                    )}
                    {draft.auth.type === "sde" && (
                      <div className="integrations-grid" style={{ marginTop: 10 }}>
                        <input
                          className="apple-input"
                          value={draft.auth.username || ""}
                          onChange={(e) => updateAuth("username", e.target.value)}
                          placeholder="Database user"
                        />
                        <input
                          className="apple-input"
                          type="password"
                          value={draft.auth.password || ""}
                          onChange={(e) => updateAuth("password", e.target.value)}
                          placeholder="Database password"
                        />
                      </div>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <button className="apple-button secondary" onClick={testConnection} disabled={testing}>
                        {testing ? "Testing…" : "Test connection"}
                      </button>
                    </div>
                    {testResult && (
                      <div style={{ marginTop: 12 }}>
                        {testResult.ok ? (
                          <div className="status-pill success">Connection checks passed</div>
                        ) : (
                          <div className="status-pill error">Fix {testResult.errors.length} issue(s)</div>
                        )}
                        {testResult.errors?.map((item) => (
                          <div key={item} className="apple-muted" style={{ marginTop: 6 }}>{item}</div>
                        ))}
                        {testResult.warnings?.map((item) => (
                          <div key={item} className="apple-muted" style={{ marginTop: 6 }}>Note: {item}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="integrations-grid">
                  <div className="integrations-grid two">
                    <div>
                      <label className="apple-label">Latitude field</label>
                      <input
                        className="apple-input"
                        value={draft.latField}
                        onChange={(e) => updateDraft({ latField: e.target.value })}
                        placeholder="latitude"
                      />
                    </div>
                    <div>
                      <label className="apple-label">Longitude field</label>
                      <input
                        className="apple-input"
                        value={draft.lonField}
                        onChange={(e) => updateDraft({ lonField: e.target.value })}
                        placeholder="longitude"
                      />
                    </div>
                    <div>
                      <label className="apple-label">Idempotent key field</label>
                      <input
                        className="apple-input"
                        value={draft.idField}
                        onChange={(e) => updateDraft({ idField: e.target.value })}
                        placeholder="asset_id"
                      />
                    </div>
                    <div>
                      <label className="apple-label">Id strategy</label>
                      <select
                        className="apple-select"
                        value={draft.idStrategy}
                        onChange={(e) => updateDraft({ idStrategy: e.target.value as "asset_id" | "lalgeo_guid" })}
                      >
                        <option value="asset_id">Use asset_id when present</option>
                        <option value="lalgeo_guid">Generate lalgeo_guid otherwise</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Attribute field mapping</div>
                    <div className="integrations-grid">
                      {draft.fieldMapping.map((mapping, index) => (
                        <div key={`${mapping.source}-${index}`} className="mapping-row">
                          <input
                            className="apple-input"
                            value={mapping.source}
                            onChange={(e) => updateMapping(index, { source: e.target.value })}
                            placeholder="source field"
                          />
                          <input
                            className="apple-input"
                            value={mapping.target}
                            onChange={(e) => updateMapping(index, { target: e.target.value })}
                            placeholder="target field"
                          />
                          <button
                            className="apple-button ghost"
                            onClick={() => removeMapping(index)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button className="apple-button secondary" onClick={addMapping} type="button">Add mapping</button>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="integrations-grid two">
                  <div>
                    <label className="apple-label">Sync mode</label>
                    <select
                      className="apple-select"
                      value={draft.syncMode}
                      onChange={(e) => updateDraft({ syncMode: e.target.value as SyncMode })}
                    >
                      <option value="instant">Instant (Dropbox webhook)</option>
                      <option value="scheduled">Scheduled only</option>
                      <option value="both">Instant + Scheduled</option>
                    </select>
                    {(draft.syncMode === "scheduled" || draft.syncMode === "both") && (
                      <div className="integrations-grid" style={{ marginTop: 10 }}>
                        <input
                          className="apple-input"
                          value={draft.scheduleCron || ""}
                          onChange={(e) => updateDraft({ scheduleCron: e.target.value })}
                          placeholder="Cron expression"
                        />
                        <input
                          className="apple-input"
                          value={draft.scheduleTz || ""}
                          onChange={(e) => updateDraft({ scheduleTz: e.target.value })}
                          placeholder="Timezone (ex: America/Los_Angeles)"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="apple-label">Attachments</label>
                    <select
                      className="apple-select"
                      value={draft.attachmentsMode}
                      onChange={(e) => updateDraft({ attachmentsMode: e.target.value as SyncAttachmentMode })}
                    >
                      <option value="attachments">Push photos as ArcGIS attachments</option>
                      <option value="urls">Store photo URLs only</option>
                    </select>
                    <label className="apple-label" style={{ marginTop: 12 }}>Soft delete flag</label>
                    <input
                      className="apple-input"
                      value={draft.softDeleteField || ""}
                      onChange={(e) => updateDraft({ softDeleteField: e.target.value })}
                      placeholder="is_deleted"
                    />
                    <label className="apple-label" style={{ marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.dryRunDefault)}
                        onChange={(e) => updateDraft({ dryRunDefault: e.target.checked })}
                        style={{ marginRight: 8 }}
                      />
                      Default to dry run previews
                    </label>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="integrations-grid">
                  <div className="integrations-card" style={{ borderRadius: 14 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Review summary</div>
                    <div className="integrations-grid two">
                      <div>
                        <div className="apple-muted">Name</div>
                        <div>{draft.name || "Untitled"}</div>
                      </div>
                      <div>
                        <div className="apple-muted">Dropbox project</div>
                        <div>{draft.dropboxProjectPath || "-"}</div>
                      </div>
                      <div>
                        <div className="apple-muted">Target</div>
                        <div>{draft.targetType.toUpperCase()}</div>
                      </div>
                      <div>
                        <div className="apple-muted">Mode</div>
                        <div>{draft.syncMode}</div>
                      </div>
                      <div>
                        <div className="apple-muted">Id strategy</div>
                        <div>{draft.idStrategy}</div>
                      </div>
                      <div>
                        <div className="apple-muted">Attachments</div>
                        <div>{draft.attachmentsMode}</div>
                      </div>
                    </div>
                    <div className="apple-muted" style={{ marginTop: 10 }}>
                      Dry run preview is available anytime with the Run now → Dry run action.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="integration-row" style={{ marginTop: 20 }}>
              <button
                className="apple-button ghost"
                onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
                disabled={step === 0}
              >
                Back
              </button>
              <div className="integration-actions">
                {step < stepLabels.length - 1 && (
                  <button className="apple-button" onClick={() => setStep((prev) => Math.min(prev + 1, stepLabels.length - 1))}>
                    Next
                  </button>
                )}
                {step === stepLabels.length - 1 && (
                  <button className="apple-button" onClick={createConnection} disabled={creating}>
                    {creating ? "Creating…" : "Create integration"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
