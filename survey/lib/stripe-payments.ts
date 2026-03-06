export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
};

type StripeAccount = {
  id: string;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
};

type StripeAccountLink = {
  object: "account_link";
  created: number;
  expires_at: number;
  url: string;
};

type StripeLoginLink = {
  object: "login_link";
  created: number;
  url: string;
};

export function isStripeConfigured() {
  return Boolean((process.env.STRIPE_SECRET_KEY || "").trim());
}

export function getStripeSecretKey() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    throw new Error("Stripe is not configured. Missing STRIPE_SECRET_KEY.");
  }
  return key;
}

async function stripeApiForm<T>(path: string, form: URLSearchParams, options?: { stripeAccount?: string }) {
  const secretKey = getStripeSecretKey();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.stripeAccount ? { "Stripe-Account": options.stripeAccount } : {}),
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function stripeApiGet<T>(path: string, options?: { stripeAccount?: string }) {
  const secretKey = getStripeSecretKey();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options?.stripeAccount ? { "Stripe-Account": options.stripeAccount } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function resolveOriginFromRequest(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export async function createInvoiceCheckoutSession(params: {
  successUrl: string;
  cancelUrl: string;
  organizationId: string;
  connectedAccountId?: string | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    notes?: string | null;
    client: {
      name: string;
      email?: string | null;
    };
  };
  companyName: string;
}) {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("submit_type", "pay");
  form.set("client_reference_id", params.invoice.id);
  form.set("success_url", params.successUrl);
  form.set("cancel_url", params.cancelUrl);
  form.set("payment_method_types[0]", "card");
  form.set("allow_promotion_codes", "true");
  if (params.invoice.client.email) {
    form.set("customer_email", params.invoice.client.email);
  }
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "cad");
  form.set("line_items[0][price_data][unit_amount]", String(params.invoice.totalCents));
  form.set("line_items[0][price_data][product_data][name]", `${params.companyName} Invoice ${params.invoice.invoiceNumber}`);
  form.set(
    "line_items[0][price_data][product_data][description]",
    params.invoice.notes || `Payment for invoice ${params.invoice.invoiceNumber}`,
  );
  form.set("metadata[source]", "lalgeo_saas");
  form.set("metadata[organizationId]", params.organizationId);
  form.set("metadata[invoiceId]", params.invoice.id);
  form.set("metadata[invoiceNumber]", params.invoice.invoiceNumber);
  if (params.connectedAccountId) {
    form.set("metadata[stripeAccountId]", params.connectedAccountId);
  }

  const session = await stripeApiForm<StripeCheckoutSession>("/checkout/sessions", form, {
    stripeAccount: params.connectedAccountId || undefined,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return session;
}

export async function createStripeConnectAccount(params: {
  email?: string | null;
  country?: string | null;
  businessName?: string | null;
}) {
  const form = new URLSearchParams();
  form.set("type", "express");
  form.set("capabilities[card_payments][requested]", "true");
  form.set("capabilities[transfers][requested]", "true");
  form.set("business_type", "company");
  if (params.email) form.set("email", params.email);
  if (params.country && params.country.length === 2) form.set("country", params.country.toUpperCase());
  if (params.businessName) {
    form.set("business_profile[name]", params.businessName);
  }
  return stripeApiForm<StripeAccount>("/accounts", form);
}

export async function createStripeConnectAccountLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}) {
  const form = new URLSearchParams();
  form.set("account", params.accountId);
  form.set("refresh_url", params.refreshUrl);
  form.set("return_url", params.returnUrl);
  form.set("type", "account_onboarding");
  return stripeApiForm<StripeAccountLink>("/account_links", form);
}

export async function getStripeConnectAccount(accountId: string) {
  return stripeApiGet<StripeAccount>(`/accounts/${encodeURIComponent(accountId)}`);
}

export async function createStripeConnectDashboardLoginLink(accountId: string) {
  return stripeApiForm<StripeLoginLink>(`/accounts/${encodeURIComponent(accountId)}/login_links`, new URLSearchParams());
}
