import { NextResponse } from "next/server";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { getInvoiceDetail } from "@/lib/saas-store";
import { createInvoiceCheckoutSession, isStripeConfigured, resolveOriginFromRequest } from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isStripeConfigured()) {
    const { id } = await context.params;
    return NextResponse.redirect(new URL(`/pay/invoices/${id}?payment=not_configured`, req.url));
  }

  const { id } = await context.params;
  const [invoice, org] = await Promise.all([
    getInvoiceDetail(DEV_ORG_ID, id),
    getDevOrganizationProfile(),
  ]);

  if (!invoice) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (invoice.status === "paid") {
    return NextResponse.redirect(new URL(`/pay/invoices/${invoice.id}?payment=already_paid`, req.url));
  }
  if (!org?.stripeConnectAccountId || !org?.stripeChargesEnabled) {
    return NextResponse.redirect(new URL(`/pay/invoices/${invoice.id}?payment=not_connected`, req.url));
  }

  const origin = resolveOriginFromRequest(req);

  try {
    const session = await createInvoiceCheckoutSession({
      successUrl: `${origin}/pay/invoices/${invoice.id}?paid=1`,
      cancelUrl: `${origin}/pay/invoices/${invoice.id}?payment=cancelled`,
      organizationId: DEV_ORG_ID,
      connectedAccountId: org.stripeConnectAccountId,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalCents: invoice.totalCents,
        notes: invoice.notes,
        client: {
          name: invoice.client.name,
          email: invoice.client.email,
        },
      },
      companyName: org?.legalName || org?.name || "LalGeo",
    });
    if (!session.url) {
      return NextResponse.redirect(new URL(`/pay/invoices/${invoice.id}?payment=checkout_error`, req.url));
    }
    return NextResponse.redirect(session.url, { status: 303 });
  } catch {
    return NextResponse.redirect(new URL(`/pay/invoices/${invoice.id}?payment=checkout_error`, req.url));
  }
}
