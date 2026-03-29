"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotHint, setForgotHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setForgotHint(false);

    const nextFieldErrors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      nextFieldErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextFieldErrors.email = "Enter a valid email address.";
    }

    if (!trimmedPassword) {
      nextFieldErrors.password = "Password is required.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("Please check the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed");
      setSubmitting(false);
      return;
    }
    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") || "/dashboard" : "/dashboard";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    router.replace(safeNext);
  };

  return (
    <main className="auth-page">
      <div className="container auth-shell">
        <div className="header auth-header">
          <div className="brand auth-brand">
            <img className="brand-logo" src="/img/lalgeo-logo.png" alt="LalGeo logo" />
            <div className="brand-cloud">CLOUD</div>
            <p className="auth-value-statement">
              Run clients, quotes, invoices, and field jobs from one clean workspace.
            </p>
          </div>
        </div>
        <div className="panel auth-card">
          <p className="auth-eyebrow">LalGeo Cloud</p>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue managing your business operations.</p>

          {error && <div className="banner auth-banner auth-banner-error">{error}</div>}
          {forgotHint ? (
            <div className="banner auth-banner">
              Password reset is managed by your workspace admin right now. Contact support at{" "}
              <a href="mailto:contactus@lalgeo.com" className="auth-inline-link">contactus@lalgeo.com</a>.
            </div>
          ) : null}

          <form className="grid auth-form" onSubmit={submit}>
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className={`input ${fieldErrors.email ? "input-error" : ""}`}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email ? <p id="email-error" className="field-error">{fieldErrors.email}</p> : null}
            </div>
            <div>
              <div className="auth-password-row">
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => setForgotHint((prev) => !prev)}
                >
                  Forgot password?
                </button>
              </div>
              <div className="auth-password-wrap">
                <input
                  id="password"
                  className={`input ${fieldErrors.password ? "input-error" : ""}`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  autoComplete="current-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password ? <p id="password-error" className="field-error">{fieldErrors.password}</p> : null}
            </div>
            <button className="button auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
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
