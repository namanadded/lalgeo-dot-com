"use client";

import Link from "next/link";
import { useState } from "react";

type PaymentMethod = "apple_pay" | "google_pay" | "card";

export default function SignupPage() {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="auth-page">
      <div className="container auth-shell">
        <div className="header auth-header">
          <div className="brand auth-brand">
            <img className="brand-logo" src="/img/lalgeo-logo.png" alt="LalGeo logo" />
            <div className="brand-cloud">CLOUD</div>
            <div className="muted">Create your LalGeo SaaS account</div>
          </div>
        </div>

        <div className="panel auth-card signup-card">
          <h2>Start your subscription</h2>
          {submitted && (
            <div className="banner">
              Checkout integration is being finalized. Your signup details were captured locally for now.
            </div>
          )}

          <form className="grid auth-form" onSubmit={onSubmit}>
            <div>
              <label>Company Name</label>
              <input className="input" name="companyName" required />
            </div>
            <div>
              <label>Work Email</label>
              <input className="input" type="email" name="email" required />
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

            <button className="button auth-submit" type="submit">
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
