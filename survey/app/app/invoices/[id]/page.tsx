import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoiceDetail, listEmailLogs } from "@/lib/saas-store";
import { ServiceDocumentSheet } from "@/components/ServiceDocumentSheet";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ emailed?: string }> | { emailed?: string };
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);
  const org = await getDevOrganizationProfile();

  const invoice = await getInvoiceDetail(DEV_ORG_ID, id);

  if (!invoice) notFound();

  const emailLogs = await listEmailLogs(DEV_ORG_ID, "invoice", invoice.id, 10);

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
    invoice.client.addressLine1,
    invoice.client.addressLine2,
    [invoice.client.city, invoice.client.stateProvince, invoice.client.postalCode].filter(Boolean).join(", "),
    invoice.client.country,
  ]
    .filter(Boolean)
    .join(" ");

  const rows = invoice.lineItems.map((line) => ({
    id: line.id,
    description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
    amount: formatCents(line.lineTotalCents),
  }));

  const emailed = typeof resolvedSearchParams === "object" && resolvedSearchParams?.emailed === "1";

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{invoice.invoiceNumber}</h1>
        <div className="top-actions">
          <Link href={`/app/invoices/${invoice.id}/email`} className="button secondary">
            Email Invoice
          </Link>
          <Link href="/app/invoices" className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {emailed ? <div className="banner">Invoice email sent with PDF attachment.</div> : null}

      <ServiceDocumentSheet
        companyName={companyName}
        companyAddress={companyAddress || "Address not set"}
        companyPhone={org?.phone || ""}
        companyEmail={org?.email || ""}
        logoUrl={org?.logoUrl}
        dateLabel={dateFormatter.format(invoice.issuedAt)}
        billToName={invoice.client.name}
        billToAddress={clientAddress || "—"}
        billToPhone={invoice.client.phone || "—"}
        rows={rows}
        subtotal={formatCents(invoice.subtotalCents)}
        tax={formatCents(invoice.taxCents)}
        total={formatCents(invoice.totalCents)}
        sentAtText={invoice.sentAt ? dateFormatter.format(invoice.sentAt) : null}
        notes={invoice.notes}
      />

      <div className="card" style={{ marginTop: 16 }}>
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

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Linked Records</strong>
        <p className="muted">
          Client: <Link href={`/app/clients/${invoice.client.id}`}>{invoice.client.name}</Link>
        </p>
        <p className="muted">
          Job: {invoice.job ? <Link href={`/app/jobs/${invoice.job.id}`}>{invoice.job.title}</Link> : "—"}
        </p>
        <p className="muted">
          Quote: {invoice.quote ? <Link href={`/app/quotes/${invoice.quote.id}`}>{invoice.quote.quoteNumber}</Link> : "—"}
        </p>
      </div>
    </div>
  );
}
