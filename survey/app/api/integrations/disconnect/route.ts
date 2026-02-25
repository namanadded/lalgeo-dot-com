import { NextResponse } from "next/server";
import { disconnectEmailProvider, getOrganizationProfile, updateOrganization } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") || "").trim();
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=invalid_provider", req.url));
  }

  await disconnectEmailProvider(DEV_ORG_ID, provider);

  const org = await getOrganizationProfile(DEV_ORG_ID);
  if (org?.emailProvider === provider) {
    await updateOrganization(DEV_ORG_ID, {
      email_provider: "smtp",
    });
  }

  return NextResponse.redirect(new URL(`/survey/app/settings?oauth=${provider}_disconnected`, req.url));
}
