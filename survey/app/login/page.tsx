"use client";

import Link from "next/link";
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
    const res = await fetch("/api/auth/login", {
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
    <main className="auth-page">
      <div className="container auth-shell">
        <div className="header auth-header">
          <div className="brand auth-brand">
            <img className="brand-logo" src="/img/lalgeo-logo.png" alt="LalGeo logo" />
            <div className="brand-cloud">CLOUD</div>
            <div className="muted">Sign in to manage your business</div>
          </div>
        </div>
        <div className="panel auth-card">
          <h2>Welcome back</h2>
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
            <button className="button auth-submit" type="submit">Sign in</button>
          </form>
          <div className="auth-footer-row">
            <span className="muted">New to LalGeo SaaS?</span>
            <Link href="/signup" className="button secondary auth-signup-link">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
