import { NextResponse } from "next/server";
import {
  netlifySubdomainExists,
  normalizeSubdomain,
  subdomainLimits,
  suggestSubdomain,
  validateSubdomain,
} from "@/lib/subdomain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyName = (url.searchParams.get("companyName") || "").trim();
  const rawSubdomain = (url.searchParams.get("subdomain") || "").trim();
  const baseDomain = (process.env.APP_BASE_DOMAIN || "lalgeo.com").trim();

  const suggested = suggestSubdomain(companyName);
  const normalizedRequested = normalizeSubdomain(rawSubdomain || suggested);
  const validation = validateSubdomain(normalizedRequested);

  let exists = false;
  if (validation.ok) {
    exists = await netlifySubdomainExists(normalizedRequested, baseDomain);
  }

  return NextResponse.json({
    baseDomain,
    limits: subdomainLimits(),
    suggested,
    normalized: normalizedRequested,
    available: validation.ok && !exists,
    reason: !validation.ok ? validation.reason : exists ? "This subdomain is already taken." : null,
  });
}
