import { NextResponse } from "next/server";
import { cookieNameForProvider, oauthCallbackUrl, randomState } from "@/lib/oauth";

export async function GET(req: Request) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    return NextResponse.redirect(new URL("/settings?oauth=google_env_missing", req.url));
  }

  const state = randomState();
  const callback = oauthCallbackUrl(req.url, "google");

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", callback);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/gmail.send");
  auth.searchParams.set("state", state);

  const res = NextResponse.redirect(auth);
  res.cookies.set({
    name: cookieNameForProvider("google"),
    value: state,
    httpOnly: true,
    path: "/",
    maxAge: 60 * 10,
    sameSite: "lax",
  });
  return res;
}
