import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { getStripeConnectAccount, isStripeConfigured } from "@/lib/stripe-payments";
import { updateOrganization } from "@/lib/saas-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  if (!isStripeConfigured()) {
    return NextResponse.redirect(new URL("/settings?stripe=env_missing", req.url));
  }

  const org = await getDevOrganizationProfile();
  if (!org?.stripeConnectAccountId) {
    return NextResponse.redirect(new URL("/settings?stripe=missing_account", req.url));
  }

  try {
    const account = await getStripeConnectAccount(org.stripeConnectAccountId);
    await updateOrganization(DEV_ORG_ID, {
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
    });
    return NextResponse.redirect(new URL("/settings?stripe=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?stripe=connect_sync_failed", req.url));
  }
}
