import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { DEV_ORG_ID, ensureDevOrganization, getDevOrganizationProfile } from "@/lib/saas";
import { createStripeConnectAccount, createStripeConnectAccountLink, isStripeConfigured, resolveOriginFromRequest } from "@/lib/stripe-payments";
import { updateOrganization } from "@/lib/saas-store";

export const runtime = "nodejs";

function normalizeCountryCode(input?: string | null) {
  const value = (input || "").trim();
  if (value.length === 2) return value.toUpperCase();
  if (value.toLowerCase() === "canada") return "CA";
  if (value.toLowerCase() === "united states" || value.toLowerCase() === "usa" || value.toLowerCase() === "us") return "US";
  return "CA";
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  if (!isStripeConfigured()) {
    return NextResponse.redirect(new URL("/settings?stripe=env_missing", req.url));
  }

  await ensureDevOrganization();
  const org = await getDevOrganizationProfile();
  if (!org) {
    return NextResponse.redirect(new URL("/settings?stripe=org_missing", req.url));
  }

  let accountId = org.stripeConnectAccountId || null;
  if (!accountId) {
    const account = await createStripeConnectAccount({
      email: org.email || undefined,
      country: normalizeCountryCode(org.country),
      businessName: org.legalName || org.name || "LalGeo Organization",
    });
    accountId = account.id;
    await updateOrganization(DEV_ORG_ID, {
      stripe_connect_account_id: account.id,
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
    });
  }

  const origin = resolveOriginFromRequest(req);
  const refreshUrl = `${origin}/api/payments/stripe/connect/start`;
  const returnUrl = `${origin}/api/payments/stripe/connect/return`;
  const link = await createStripeConnectAccountLink({
    accountId,
    refreshUrl,
    returnUrl,
  });
  return NextResponse.redirect(link.url, { status: 303 });
}

export async function POST(req: Request) {
  return GET(req);
}
