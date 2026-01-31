"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Survey {
  id: string;
  name: string;
  publicId: string;
}

export default function ShareSurveyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/survey/api/surveys/${params.id}`);
      if (res.status === 401) {
        router.replace("/survey/login");
        return;
      }
      if (!res.ok) {
        router.replace("/survey/dashboard");
        return;
      }
      const data = await res.json();
      setSurvey(data.survey);
    };
    load();
  }, []);

  const copy = async () => {
    if (!survey) return;
    const url = `${window.location.origin}/survey/s/${survey.publicId}`;
    await navigator.clipboard.writeText(url);
    alert("Share link copied!");
  };

  if (!survey) {
    return (
      <main>
        <div className="container">
          <div className="panel">Loading…</div>
        </div>
      </main>
    );
  }

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/survey/s/${survey.publicId}`;

  return (
    <main>
      <div className="container">
        <div className="header">
          <div>
            <div className="brand-title">Share Survey</div>
            <div className="muted">{survey.name}</div>
          </div>
          <button className="button secondary" onClick={() => router.push("/survey/dashboard")}>Back</button>
        </div>
        <div className="panel">
          <h2>Public survey link</h2>
          <p className="muted">Anyone with this link can fill the survey. Responses are stored in LalGeo Cloud.</p>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Share URL</div>
            <div style={{ wordBreak: "break-all" }}>{link}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="button" onClick={copy}>Copy link</button>
          </div>
          <div className="banner" style={{ marginTop: 20 }}>
            Each survey is limited to 100 MB including attachments.
          </div>
        </div>
      </div>
    </main>
  );
}
