import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieNameForProvider, oauthCallbackUrl } from "@/lib/oauth";
import { DEV_ORG_ID, ensureDevOrganization } from "@/lib/saas";
import { upsertEmailConnection, updateOrganization } from "@/lib/saas-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(cookieNameForProvider("google"))?.value || "";
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=google_state_invalid", req.url));
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=google_env_missing", req.url));
  }

  const callback = oauthCallbackUrl(req.url, "google");
  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callback,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=google_token_failed", req.url));
  }
  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token) {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=google_token_failed", req.url));
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) {
    return NextResponse.redirect(new URL("/survey/app/settings?oauth=google_profile_failed", req.url));
  }
  const profile = (await profileRes.json()) as { email?: string };
  const email = profile.email || "unknown@gmail";

  await ensureDevOrganization();
  await upsertEmailConnection({
    organizationId: DEV_ORG_ID,
    provider: "google",
    email,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    scopes: token.scope || null,
  });

  await updateOrganization(DEV_ORG_ID, {
    email_provider: "google",
  });

  const res = NextResponse.redirect(new URL("/survey/app/settings?oauth=google_connected", req.url));
  res.cookies.set({
    name: cookieNameForProvider("google"),
    value: "",
    path: "/",
    maxAge: 0,
  });
  return res;
}
