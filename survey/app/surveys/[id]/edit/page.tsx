"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type QuestionType = "text" | "number" | "dropdown" | "multiChoice" | "picture";

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  pictureSize?: "small" | "medium" | "large";
}

interface Survey {
  id: string;
  name: string;
  description?: string;
  publicId: string;
  questions: Question[];
}

export default function EditSurveyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState<QuestionType>("text");
  const [qOptions, setQOptions] = useState("");
  const [qRequired, setQRequired] = useState(false);
  const [qSize, setQSize] = useState<"small" | "medium" | "large">("small");
  const [error, setError] = useState<string | null>(null);

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
    setName(data.survey.name || "");
    setDescription(data.survey.description || "");
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (nextQuestions: Question[]) => {
    setError(null);
    const res = await fetch(`/survey/api/surveys/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, questions: nextQuestions }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save");
      return;
    }
    const data = await res.json();
    setSurvey(data.survey);
  };

  const addQuestion = async () => {
    if (!survey) return;
    if (!qText.trim()) {
      setError("Question text required");
      return;
    }
    const next = [...survey.questions, {
      id: crypto.randomUUID(),
      text: qText.trim(),
      type: qType,
      options: qOptions.split(",").map((v) => v.trim()).filter(Boolean),
      required: qRequired,
      pictureSize: qType === "picture" ? qSize : undefined,
    }];
    await save(next);
    setQText("");
    setQOptions("");
    setQRequired(false);
    setQType("text");
  };

  const removeQuestion = async (id: string) => {
    if (!survey) return;
    const next = survey.questions.filter((q) => q.id !== id);
    await save(next);
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

  return (
    <main>
      <div className="container">
        <div className="header">
          <div>
            <div className="brand-title">Edit Survey</div>
            <div className="muted">{survey.name}</div>
          </div>
          <div className="top-actions">
            <button className="button secondary" onClick={() => router.push("/survey/dashboard")}>Back</button>
            <button className="button" onClick={() => save(survey.questions)}>Save changes</button>
          </div>
        </div>

        {error && <div className="banner" style={{ background: "#f8d7d0" }}>{error}</div>}

        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>Survey details</h2>
          <div className="grid grid-2">
            <div>
              <label>Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label>Description</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>Add question</h2>
          <div className="grid grid-2">
            <div>
              <label>Question text</label>
              <input className="input" value={qText} onChange={(e) => setQText(e.target.value)} />
            </div>
            <div>
              <label>Type</label>
              <select value={qType} onChange={(e) => setQType(e.target.value as QuestionType)}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="multiChoice">Multiple choice</option>
                <option value="picture">Picture</option>
              </select>
            </div>
            {(qType === "dropdown" || qType === "multiChoice") && (
              <div>
                <label>Options (comma separated)</label>
                <input className="input" value={qOptions} onChange={(e) => setQOptions(e.target.value)} />
              </div>
            )}
            {qType === "picture" && (
              <div>
                <label>Picture size</label>
                <select value={qSize} onChange={(e) => setQSize(e.target.value as "small" | "medium" | "large")}>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            )}
            <div>
              <label>Required</label>
              <select value={qRequired ? "yes" : "no"} onChange={(e) => setQRequired(e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="button" onClick={addQuestion}>Add question</button>
          </div>
        </div>

        <div className="panel">
          <h2>Questions</h2>
          {survey.questions.length === 0 && <div className="muted">No questions yet.</div>}
          {survey.questions.map((q) => (
            <div className="question-item" key={q.id}>
              <div>
                <div style={{ fontWeight: 700 }}>{q.text}</div>
                <div className="muted">{q.type} {q.required ? "· required" : ""}</div>
                {q.options.length > 0 && <div className="muted">Options: {q.options.join(", ")}</div>}
              </div>
              <div className="top-actions">
                <span className="pill">{q.type}</span>
                <button className="button danger" onClick={() => removeQuestion(q.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
