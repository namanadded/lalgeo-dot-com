import Link from "next/link";
import { notFound } from "next/navigation";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { getInvoiceDetail } from "@/lib/saas-store";
import { formatCents } from "@/lib/quotes";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function PublicInvoicePayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ paid?: string; payment?: string }> | { paid?: string; payment?: string };
}) {
  const [{ id }, org, resolvedSearchParams] = await Promise.all([
    params,
    getDevOrganizationProfile(),
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);

  const invoice = await getInvoiceDetail(DEV_ORG_ID, id);
  if (!invoice) notFound();

  const companyName = org?.legalName || org?.name || "LalGeo";
  const paid = typeof resolvedSearchParams === "object" && resolvedSearchParams?.paid === "1";
  const paymentStatus = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.payment : undefined;

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 760 }}>
        <h1 style={{ marginBottom: 10 }}>{companyName}</h1>
        <p className="muted" style={{ marginTop: 0 }}>Invoice payment</p>

        <div className="card" style={{ marginTop: 12 }}>
          <p><strong>Invoice:</strong> {invoice.invoiceNumber}</p>
          <p><strong>Client:</strong> {invoice.client.name}</p>
          <p><strong>Issued:</strong> {dateFormatter.format(invoice.issuedAt)}</p>
          <p><strong>Due:</strong> {invoice.dueAt ? dateFormatter.format(invoice.dueAt) : "—"}</p>
          <p><strong>Total:</strong> {formatCents(invoice.totalCents)}</p>
          <p><strong>Status:</strong> {invoice.status}</p>
        </div>

        {paid ? <div className="banner">Payment completed successfully.</div> : null}
        {paymentStatus === "cancelled" ? <div className="banner">Payment was cancelled.</div> : null}
        {paymentStatus === "checkout_error" ? <div className="banner">Could not start checkout. Please try again.</div> : null}
        {paymentStatus === "not_configured" ? <div className="banner">Payments are not available right now. Please contact the business.</div> : null}
        {paymentStatus === "not_connected" ? <div className="banner">This business has not completed Stripe onboarding yet.</div> : null}
        {paymentStatus === "already_paid" ? <div className="banner">This invoice is already paid.</div> : null}

        {invoice.status !== "paid" ? (
          <form method="post" action={`/api/payments/public/invoices/${invoice.id}/checkout`} style={{ marginTop: 14 }}>
            <button type="submit" className="button" style={{ width: "100%" }}>
              Pay with Card / Apple Pay / Google Pay
            </button>
          </form>
        ) : null}

        <p className="muted" style={{ marginTop: 14 }}>
          Need help? Contact {org?.email || "the business"}.
        </p>

        <p style={{ marginTop: 10 }}>
          <Link href="/login" className="muted">Business login</Link>
        </p>
      </div>
    </main>
  );
}
