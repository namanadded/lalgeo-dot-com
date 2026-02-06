"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type QuestionType = "text" | "number" | "dropdown" | "multiChoice" | "picture";

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
}

interface Survey {
  id: string;
  publicId: string;
  name: string;
  description?: string;
  questions: Question[];
}

export default function PublicSurveyPage() {
  const params = useParams<{ publicId: string }>();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, string[]>>({});
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!params?.publicId) {
        setStatus("Survey not found");
        return;
      }
      const res = await fetch(`/survey/api/public/${params.publicId}`);
      if (!res.ok) {
        setStatus("Survey not found");
        return;
      }
      const data = await res.json();
      setSurvey(data.survey);
    };
    load();
  }, [params]);

  const onUpload = async (questionId: string, file: File) => {
    if (!params?.publicId) {
      setStatus("Survey not found");
      return;
    }
    const form = new FormData();
    form.append("publicId", String(params.publicId));
    form.append("file", file);
    const res = await fetch("/survey/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || "Upload failed");
      return;
    }
    const data = await res.json();
    const uploaded = data.files?.[0]?.url;
    if (!uploaded) return;
    setAttachments((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), uploaded],
    }));
  };

  const submit = async () => {
    if (!params?.publicId) {
      setStatus("Survey not found");
      return;
    }
    if (!survey) return;
    setStatus(null);
    for (const q of survey.questions) {
      if (q.required && !answers[q.text] && !(attachments[q.id]?.length)) {
        setStatus(`Please answer: ${q.text}`);
        return;
      }
    }
    const res = await fetch(`/survey/api/public/${params.publicId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        attachments,
        lat: lat || undefined,
        lon: lon || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || "Submit failed");
      return;
    }
    setStatus("Thanks! Your response is recorded.");
    setAnswers({});
    setAttachments({});
    setLat("");
    setLon("");
  };

  if (!survey) {
    return (
      <main>
        <div className="container">
          <div className="panel">{status || "Loading…"}</div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="container">
        <div className="header">
          <div>
            <div className="brand-title">{survey.name}</div>
            {survey.description && <div className="muted">{survey.description}</div>}
          </div>
        </div>

        {status && <div className="banner">{status}</div>}

        <div className="panel">
          <div className="grid">
            {survey.questions.map((q) => (
              <div key={q.id} className="card">
                <label>{q.text} {q.required && "*"}</label>
                {q.type === "text" && (
                  <input className="input" value={answers[q.text] || ""} onChange={(e) => setAnswers({ ...answers, [q.text]: e.target.value })} />
                )}
                {q.type === "number" && (
                  <input className="input" type="number" value={answers[q.text] || ""} onChange={(e) => setAnswers({ ...answers, [q.text]: e.target.value })} />
                )}
                {q.type === "dropdown" && (
                  <select value={answers[q.text] || ""} onChange={(e) => setAnswers({ ...answers, [q.text]: e.target.value })}>
                    <option value="">Select…</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {q.type === "multiChoice" && (
                  <div className="grid">
                    {q.options.map((opt) => (
                      <label key={opt} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={(answers[q.text] || "").split("|").includes(opt)}
                          onChange={(e) => {
                            const current = (answers[q.text] || "").split("|").filter(Boolean);
                            const next = e.target.checked
                              ? [...current, opt]
                              : current.filter((item) => item !== opt);
                            setAnswers({ ...answers, [q.text]: next.join("|") });
                          }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
                {q.type === "picture" && (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUpload(q.id, file);
                      }}
                    />
                    {(attachments[q.id] || []).length > 0 && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        Uploaded: {(attachments[q.id] || []).length} file(s)
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="card">
              <label>Latitude (optional)</label>
              <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} />
              <label style={{ marginTop: 12 }}>Longitude (optional)</label>
              <input className="input" value={lon} onChange={(e) => setLon(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button className="button" onClick={submit}>Submit response</button>
          </div>
        </div>
      </div>
    </main>
  );
}
