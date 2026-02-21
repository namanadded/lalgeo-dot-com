"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const res = await fetch("/survey/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed");
      return;
    }
    router.replace("/dashboard");
  };

  return (
    <main>
      <div className="container">
        <div className="header">
          <div className="brand">
            <img src="/survey/img/lalgeo-logo.png" alt="LalGeo" />
              <div>
              <div className="brand-title">LalGeo Cloud</div>
              <div className="muted">Sign in to manage surveys</div>
              </div>
          </div>
        </div>
        <div className="panel" style={{ maxWidth: 520 }}>
          <h2>Welcome back</h2>
          {error && <div className="banner" style={{ background: "#f8d7d0" }}>{error}</div>}
          <form className="grid" onSubmit={submit}>
            <div>
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="button" type="submit">Sign in</button>
          </form>
        </div>
      </div>
    </main>
  );
}
