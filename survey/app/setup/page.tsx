"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const res = await fetch("/survey/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Setup failed");
      return;
    }
    router.replace("/dashboard");
  };

  return (
    <main className="auth-page">
      <div className="container auth-shell">
        <div className="header auth-header">
          <div className="brand auth-brand">
            <img className="brand-logo" src="/survey/img/lalgeo-logo.png" alt="LalGeo logo" />
            <div className="brand-cloud">CLOUD</div>
            <div className="muted">First-time admin setup</div>
          </div>
        </div>
        <div className="panel auth-card">
          <h2>Create admin account</h2>
          {error && <div className="banner" style={{ background: "#f8d7d0" }}>{error}</div>}
          <form className="grid auth-form" onSubmit={submit}>
            <div>
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="button auth-submit" type="submit">Create admin</button>
          </form>
        </div>
      </div>
    </main>
  );
}
