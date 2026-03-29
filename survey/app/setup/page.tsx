"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
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
    } else if (trimmedPassword.length < 8) {
      nextFieldErrors.password = "Password must be at least 8 characters.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("Please check the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Setup failed");
      setSubmitting(false);
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
            <p className="auth-value-statement">
              Secure your workspace and start managing clients, jobs, quotes, and invoices.
            </p>
          </div>
        </div>
        <div className="panel auth-card">
          <p className="auth-eyebrow">Workspace Setup</p>
          <h1 className="auth-title">Create admin account</h1>
          <p className="auth-subtitle">Set your primary admin credentials for LalGeo Cloud.</p>

          {error && <div className="banner auth-banner auth-banner-error">{error}</div>}
          <form className="grid auth-form" onSubmit={submit}>
            <div>
              <label htmlFor="setup-email">Email</label>
              <input
                id="setup-email"
                className={`input ${fieldErrors.email ? "input-error" : ""}`}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                autoComplete="email"
              />
              {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
            </div>
            <div>
              <label htmlFor="setup-password">Password</label>
              <div className="auth-password-wrap">
                <input
                  id="setup-password"
                  className={`input ${fieldErrors.password ? "input-error" : ""}`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
            </div>
            <button className="button auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Creating admin..." : "Create admin"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
