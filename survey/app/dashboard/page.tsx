"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface IndexEntry {
  id: string;
  publicId: string;
  name: string;
  updatedAt: string;
  responseCount: number;
  sizeBytes: number;
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value > 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<IndexEntry[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const res = await fetch("/survey/api/surveys");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    setSurveys(data.surveys || []);
  };

  useEffect(() => {
    load();
  }, []);

  const createSurvey = async () => {
    setError(null);
    const res = await fetch("/survey/api/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create");
      return;
    }
    setName("");
    setDescription("");
    await load();
  };

  const logout = async () => {
    await fetch("/survey/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const importSurvey = async (file: File) => {
    setImporting(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/survey/api/import", { method: "POST", body: form });
    setImporting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Import failed");
      return;
    }
    await load();
  };

  return (
    <main>
      <div className="container">
        <div className="header">
          <div className="brand">
            <img src="/survey/img/lalgeo-logo.png" alt="LalGeo" />
            <div>
              <div className="brand-title">Survey Dashboard</div>
              <div className="muted">LalGeo Cloud on /Volumes/LALGEO_CLOUD</div>
            </div>
          </div>
          <div className="top-actions">
            <button className="button secondary" onClick={() => router.push("/integrations")}>Sync integrations</button>
            <button className="button secondary" onClick={logout}>Sign out</button>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>Create a new survey</h2>
          {error && <div className="banner" style={{ background: "#f8d7d0" }}>{error}</div>}
          <div className="grid grid-2">
            <div>
              <label>Survey name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label>Description</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="button" onClick={createSurvey}>Create survey</button>
            <label style={{ marginLeft: 10 }}>
              <input
                type="file"
                accept=".lal,.zip"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importSurvey(file);
                }}
              />
              <span className="button secondary" style={{ marginLeft: 10, opacity: importing ? 0.6 : 1 }}>
                {importing ? "Importing…" : "Import .lal"}
              </span>
            </label>
          </div>
        </div>

        <div className="panel">
          <h2>Your surveys</h2>
          <div className="grid" style={{ marginTop: 12 }}>
            {surveys.length === 0 && <div className="muted">No surveys yet.</div>}
            {surveys.map((survey) => (
              <div key={survey.id} className="question-item">
                <div>
                  <div style={{ fontWeight: 700 }}>{survey.name}</div>
                  <div className="muted">Updated {new Date(survey.updatedAt).toLocaleString()}</div>
                  <div className="muted">{survey.responseCount} responses · {formatBytes(survey.sizeBytes)}</div>
                </div>
                <div className="top-actions">
                  <button className="button secondary" onClick={() => router.push(`/survey/surveys/${survey.id}/edit`)}>Edit</button>
                  <button className="button secondary" onClick={() => router.push(`/survey/surveys/${survey.id}/share`)}>Share</button>
                  <a className="button" href={`/survey/api/surveys/${survey.id}/export`}>Download .lal</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
