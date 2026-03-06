import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDevOrganizationProfile } from "@/lib/saas";
import { createStripeConnectDashboardLoginLink, isStripeConfigured } from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  if (!isStripeConfigured()) return NextResponse.redirect(new URL("/settings?stripe=env_missing", req.url));

  const org = await getDevOrganizationProfile();
  if (!org?.stripeConnectAccountId) {
    return NextResponse.redirect(new URL("/settings?stripe=missing_account", req.url));
  }

  try {
    const link = await createStripeConnectDashboardLoginLink(org.stripeConnectAccountId);
    return NextResponse.redirect(link.url, { status: 303 });
  } catch {
    return NextResponse.redirect(new URL("/settings?stripe=dashboard_failed", req.url));
  }
}
