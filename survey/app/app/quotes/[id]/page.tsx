import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteDetail, listEmailLogs } from "@/lib/saas-store";
import { ServiceDocumentSheet } from "@/components/ServiceDocumentSheet";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";
import { getSessionUser } from "@/lib/auth";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ emailed?: string; saved?: string }> | { emailed?: string; saved?: string };
}) {
  const [{ id }, org, resolvedSearchParams] = await Promise.all([
    params,
    getDevOrganizationProfile(),
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);
  const session = await getSessionUser();

  const quote = await getQuoteDetail(DEV_ORG_ID, id);

  if (!quote) notFound();
  const emailLogs = await listEmailLogs(DEV_ORG_ID, "quote", quote.id, 10);

  const companyName = org?.legalName || org?.name || "LalGeo";
  const companyAddress = [
    org?.addressLine1,
    org?.addressLine2,
    [org?.city, org?.stateProvince, org?.postalCode].filter(Boolean).join(", "),
    org?.country,
  ]
    .filter(Boolean)
    .join("\n");
  const clientAddress = [
    quote.client.addressLine1,
    quote.client.addressLine2,
    [quote.client.city, quote.client.stateProvince, quote.client.postalCode].filter(Boolean).join(", "),
    quote.client.country,
  ]
    .filter(Boolean)
    .join(" ");
  const quoteRows = quote.lineItems.map((line) => ({
    id: line.id,
    description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
    amount: formatCents(line.lineTotalCents),
  }));
  const emailed = typeof resolvedSearchParams === "object" && resolvedSearchParams?.emailed === "1";
  const saved = typeof resolvedSearchParams === "object" && resolvedSearchParams?.saved === "1";

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{quote.quoteNumber}</h1>
        <div className="top-actions">
          <Link href={`/quotes/${quote.id}/email`} className="button secondary">
            Email Quote
          </Link>
          {session?.role === "admin" ? (
            <Link href={`/quotes/${quote.id}/edit`} className="button secondary">
              Edit Quote
            </Link>
          ) : null}
          {quote.invoices.length === 0 ? (
            <Link href={`/invoices/new?quoteId=${quote.id}`} className="button secondary">
              Create Invoice
            </Link>
          ) : null}
          <Link href="/quotes" className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {emailed ? <div className="banner">Quote email sent with PDF attachment.</div> : null}
      {saved ? <div className="banner">Quote updated.</div> : null}

      <ServiceDocumentSheet
        companyName={companyName}
        companyAddress={companyAddress || "Address not set"}
        companyPhone={org?.phone || ""}
        companyEmail={org?.email || ""}
        logoUrl={org?.logoUrl}
        dateLabel={dateFormatter.format(quote.createdAt)}
        billToName={quote.client.name}
        billToAddress={clientAddress || "—"}
        billToPhone={quote.client.phone || "—"}
        rows={quoteRows}
        subtotal={formatCents(quote.subtotalCents)}
        tax={formatCents(quote.taxCents)}
        total={formatCents(quote.totalCents)}
        sentAtText={
          quote.sentAt
            ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(quote.sentAt)
            : null
        }
        notes={quote.notes}
      />

      <div className="card" style={{ marginTop: 12 }}>
        <strong>Email History</strong>
        {emailLogs.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>No email activity yet.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {emailLogs.map((log) => (
              <div key={log.id} className="muted" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e5e9f2" }}>
                <div>
                  {log.status === "sent" ? "Sent" : "Failed"} • {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(log.sentAt || log.createdAt)}
                </div>
                <div>To: {log.recipientTo}{log.recipientCc ? ` • Cc: ${log.recipientCc}` : ""}</div>
                <div>Provider: {log.provider || "—"} • Subject: {log.subject}</div>
                {log.errorMessage ? <div>Error: {log.errorMessage}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
