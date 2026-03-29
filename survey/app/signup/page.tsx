"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PaymentMethod = "apple_pay" | "google_pay" | "card";
type AvailabilityResponse = {
  baseDomain: string;
  limits: { min: number; max: number };
  suggested: string;
  normalized: string;
  available: boolean;
  reason: string | null;
};

export default function SignupPage() {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [submitted, setSubmitted] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [didEditSubdomain, setDidEditSubdomain] = useState(false);
  const [baseDomain, setBaseDomain] = useState("lalgeo.com");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [availabilityReason, setAvailabilityReason] = useState("");
  const [subdomainMax, setSubdomainMax] = useState(30);

  const fullDomain = useMemo(
    () => `${(subdomain || "").trim() || "your-company"}.${baseDomain}`,
    [subdomain, baseDomain],
  );

  useEffect(() => {
    if (!companyName.trim() && !subdomain.trim()) {
      setAvailability("idle");
      setAvailabilityReason("");
      return;
    }

    const timer = setTimeout(async () => {
      setAvailability("checking");
      const params = new URLSearchParams();
      if (companyName.trim()) params.set("companyName", companyName.trim());
      if (subdomain.trim()) params.set("subdomain", subdomain.trim());

      try {
        const res = await fetch(`/api/signup/subdomain?${params.toString()}`);
        const data = (await res.json()) as AvailabilityResponse;

        setBaseDomain(data.baseDomain || "lalgeo.com");
        setSubdomainMax(data.limits?.max || 30);
        setAvailabilityReason(data.reason || "");

        if (!didEditSubdomain && data.suggested) {
          setSubdomain(data.suggested);
        } else if (didEditSubdomain && data.normalized !== subdomain) {
          setSubdomain(data.normalized);
        }

        setAvailability(data.available ? "available" : "unavailable");
      } catch {
        setAvailability("unavailable");
        setAvailabilityReason("Could not verify subdomain right now.");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [companyName, subdomain, didEditSubdomain]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (availability !== "available") {
      setSubmitted(false);
      return;
    }
    setSubmitted(true);
  }

  return (
    <main className="auth-page">
      <div className="container auth-shell">
        <div className="header auth-header">
          <div className="brand auth-brand">
            <img className="brand-logo" src="/img/lalgeo-logo.png" alt="LalGeo logo" />
            <div className="brand-cloud">CLOUD</div>
            <p className="auth-value-statement">
              Launch your business workspace with quoting, invoicing, client tracking, and scheduling in one place.
            </p>
          </div>
        </div>

        <div className="panel auth-card signup-card">
          <p className="auth-eyebrow">Get Started</p>
          <h1 className="auth-title">Start your subscription</h1>
          <p className="auth-subtitle">Create your organization and reserve your LalGeo workspace domain.</p>
          {submitted && (
            <div className="banner auth-banner">
              Checkout integration is being finalized. Your signup details were captured locally for now.
            </div>
          )}

          <form className="grid auth-form" onSubmit={onSubmit}>
            <div>
              <label>Company Name</label>
              <input
                className="input"
                name="companyName"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </div>
            <div>
              <label>Work Email</label>
              <input className="input" type="email" name="email" required />
            </div>
            <div>
              <label>Suggested Domain</label>
              <div className="signup-domain-row">
                <input
                  className="input signup-domain-input"
                  name="subdomain"
                  value={subdomain}
                  onChange={(event) => {
                    setDidEditSubdomain(true);
                    setSubdomain(event.target.value.toLowerCase());
                  }}
                  minLength={3}
                  maxLength={subdomainMax}
                  required
                />
                <span className="signup-domain-suffix">.{baseDomain}</span>
              </div>
              <div
                className={`muted signup-domain-status ${
                  availability === "available"
                    ? "ok"
                    : availability === "unavailable"
                      ? "bad"
                      : ""
                }`}
              >
                {availability === "checking"
                  ? "Checking availability..."
                  : availability === "available"
                    ? `${fullDomain} is available.`
                    : availability === "unavailable"
                      ? availabilityReason || "This subdomain is unavailable."
                      : "Enter company name to get a suggested domain."}
              </div>
              <div className="muted">
                Other SaaS apps typically suggest a domain and let the user edit it before checkout.
              </div>
            </div>
            <div>
              <label>Coupon Code (optional)</label>
              <input className="input" name="couponCode" />
            </div>

            <div>
              <label>Choose Payment Method</label>
              <div className="signup-pay-grid">
                <button
                  type="button"
                  className={`signup-pay-option${paymentMethod === "apple_pay" ? " selected" : ""}`}
                  onClick={() => setPaymentMethod("apple_pay")}
                >
                  Apple Pay
                </button>
                <button
                  type="button"
                  className={`signup-pay-option${paymentMethod === "google_pay" ? " selected" : ""}`}
                  onClick={() => setPaymentMethod("google_pay")}
                >
                  Google Pay
                </button>
                <button
                  type="button"
                  className={`signup-pay-option${paymentMethod === "card" ? " selected" : ""}`}
                  onClick={() => setPaymentMethod("card")}
                >
                  Credit / Debit Card
                </button>
              </div>
            </div>

            <button className="button auth-submit" type="submit" disabled={availability !== "available"}>
              Continue to Secure Checkout
            </button>
          </form>

          <div className="auth-footer-row">
            <span className="muted">Already have an account?</span>
            <Link href="/login" className="button secondary auth-signup-link">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
