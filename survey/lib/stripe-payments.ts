export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
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

export function resolveOriginFromRequest(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export async function createInvoiceCheckoutSession(params: {
  origin: string;
  organizationId: string;
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
  const secretKey = getStripeSecretKey();
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("submit_type", "pay");
  form.set("client_reference_id", params.invoice.id);
  form.set("success_url", `${params.origin}/invoices/${params.invoice.id}?paid=1`);
  form.set("cancel_url", `${params.origin}/invoices/${params.invoice.id}?payment=cancelled`);
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

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe checkout create failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const session = (await res.json()) as StripeCheckoutSession;

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return session;
}
