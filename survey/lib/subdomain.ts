const MAX_SUBDOMAIN_LENGTH = 30;
const MIN_SUBDOMAIN_LENGTH = 3;

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "support",
  "help",
  "status",
  "blog",
  "docs",
  "cloud",
  "ftp",
  "cdn",
  "portal",
]);

export function subdomainLimits() {
  return {
    min: MIN_SUBDOMAIN_LENGTH,
    max: MAX_SUBDOMAIN_LENGTH,
  };
}

export function normalizeSubdomain(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, MAX_SUBDOMAIN_LENGTH);
}

export function suggestSubdomain(companyName: string): string {
  const normalized = normalizeSubdomain(companyName);
  if (normalized.length >= MIN_SUBDOMAIN_LENGTH) return normalized;
  return "my-company";
}

export function validateSubdomain(value: string): { ok: boolean; reason?: string } {
  const limits = subdomainLimits();
  if (!value) return { ok: false, reason: "Enter a subdomain." };
  if (value.length < limits.min) {
    return { ok: false, reason: `Use at least ${limits.min} characters.` };
  }
  if (value.length > limits.max) {
    return { ok: false, reason: `Use at most ${limits.max} characters.` };
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    return { ok: false, reason: "Use only lowercase letters, numbers, and dashes." };
  }
  if (value.startsWith("-") || value.endsWith("-")) {
    return { ok: false, reason: "Cannot start or end with a dash." };
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { ok: false, reason: "This subdomain is reserved." };
  }
  return { ok: true };
}

export async function netlifySubdomainExists(subdomain: string, baseDomain: string): Promise<boolean> {
  const token = (process.env.NETLIFY_API_TOKEN || "").trim();
  const siteId = (process.env.NETLIFY_SITE_ID || "").trim();
  if (!token || !siteId) return false;

  const fullDomain = `${subdomain}.${baseDomain}`;
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/domains`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return false;
  }

  const domains = (await res.json()) as Array<{ hostname?: string; name?: string; domain?: string }>;
  return domains.some((entry) => {
    const value = (entry.hostname || entry.name || entry.domain || "").toLowerCase();
    return value === fullDomain.toLowerCase();
  });
}
