import { NextResponse } from "next/server";
import { cookieNameForProvider, oauthCallbackUrl, randomState } from "@/lib/oauth";

export async function GET(req: Request) {
  const clientId = (process.env.MICROSOFT_CLIENT_ID || "").trim();
  if (!clientId) {
    return NextResponse.redirect(new URL("/settings?oauth=microsoft_env_missing", req.url));
  }

  const state = randomState();
  const callback = oauthCallbackUrl(req.url, "microsoft");

  const auth = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", callback);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid profile email offline_access User.Read Mail.Send");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(auth);
  res.cookies.set({
    name: cookieNameForProvider("microsoft"),
    value: state,
    httpOnly: true,
    path: "/",
    maxAge: 60 * 10,
    sameSite: "lax",
  });
  return res;
}
