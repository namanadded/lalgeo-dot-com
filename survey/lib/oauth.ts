import crypto from "node:crypto";

export function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

export function cookieNameForProvider(provider: "google" | "microsoft") {
  return `lalgeo_oauth_state_${provider}`;
}

export function appBaseFromRequest(reqUrl: string) {
  const u = new URL(reqUrl);
  return `${u.protocol}//${u.host}`;
}

export function appBasePath() {
  return "";
}

export function oauthCallbackUrl(reqUrl: string, provider: "google" | "microsoft") {
  const base = appBaseFromRequest(reqUrl);
  const basePath = appBasePath();
  return `${base}${basePath}/api/integrations/${provider}/callback`;
}
