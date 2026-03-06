import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { DEV_ORG_ID } from "@/lib/saas";
import { updateOrganization } from "@/lib/saas-store";

export const runtime = "nodejs";

async function clearStripeConnect(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  await updateOrganization(DEV_ORG_ID, {
    stripe_connect_account_id: null,
    stripe_charges_enabled: false,
    stripe_payouts_enabled: false,
    stripe_details_submitted: false,
  });
  return NextResponse.redirect(new URL("/settings?stripe=disconnected", req.url));
}

export async function POST(req: Request) {
  return clearStripeConnect(req);
}
