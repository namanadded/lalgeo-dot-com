import Link from "next/link";
import { redirect } from "next/navigation";
import { createEmailLog, getInvoiceDetail, markInvoiceSent } from "@/lib/saas-store";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";
import { buildInvoicePdf } from "@/lib/pdf";
import { sendOrganizationEmail } from "@/lib/email-delivery";
import { renderDocumentEmailHtml } from "@/lib/email-template";
import { appBasePath } from "@/lib/url";

export const dynamic = "force-dynamic";

async function sendInvoiceEmail(formData: FormData) {
  "use server";

  const invoiceId = String(formData.get("invoiceId") || "").trim();
  const to = String(formData.get("to") || "").trim();
  const ccRaw = String(formData.get("cc") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const message = String(formData.get("message") || "").trim();
  if (!invoiceId || !to || !subject || !message) return;

  const [org, invoice] = await Promise.all([
    getDevOrganizationProfile(),
    getInvoiceDetail(DEV_ORG_ID, invoiceId),
  ]);
  if (!invoice) return;

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

  const pdf = buildInvoicePdf({
    companyName,
    companyAddress,
    companyPhone: org?.phone || "",
    companyEmail: org?.email || "",
    documentNumber: invoice.invoiceNumber,
    dateLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
      invoice.issuedAt,
    ),
    clientName: invoice.client.name,
    clientAddress,
    clientPhone: invoice.client.phone || "",
    lines: invoice.lineItems.map((line) => ({
      description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
      amount: formatCents(line.lineTotalCents),
    })),
    subtotal: formatCents(invoice.subtotalCents),
    tax: formatCents(invoice.taxCents),
    total: formatCents(invoice.totalCents),
    notes: invoice.notes || "",
  });

  const html = renderDocumentEmailHtml({
    companyName,
    logoUrl: org?.logoUrl,
    subject,
    preface: `Please find your invoice ${invoice.invoiceNumber} from ${companyName}.`,
    message,
    documentNumber: invoice.invoiceNumber,
    clientName: invoice.client.name,
    total: formatCents(invoice.totalCents),
  });

  try {
    const result = await sendOrganizationEmail({
      organizationId: DEV_ORG_ID,
      providerPreference: "auto",
      fromFallback: org?.smtpFrom || org?.email || "no-reply@lalgeo.local",
      to: [to],
      cc: ccRaw ? [ccRaw] : [],
      subject,
      text: message,
      html,
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          contentType: "application/pdf",
          content: pdf,
        },
      ],
    });
    await createEmailLog({
      organizationId: DEV_ORG_ID,
      documentType: "invoice",
      documentId: invoiceId,
      provider: result.provider,
      status: "sent",
      recipientTo: to,
      recipientCc: ccRaw || null,
      subject,
      sentAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error";
    await createEmailLog({
      organizationId: DEV_ORG_ID,
      documentType: "invoice",
      documentId: invoiceId,
      status: "failed",
      recipientTo: to,
      recipientCc: ccRaw || null,
      subject,
      errorMessage: message.slice(0, 500),
    });
    redirect(`/invoices/${invoiceId}/email?error=send_failed&reason=${encodeURIComponent(message.slice(0, 200))}`);
  }

  await markInvoiceSent(DEV_ORG_ID, invoiceId, invoice.status === "draft" ? "sent" : invoice.status);

  redirect(`/invoices/${invoiceId}?emailed=1`);
}

export default async function InvoiceEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; oauth?: string; reason?: string }> | { error?: string; oauth?: string; reason?: string };
}) {
  const [{ id }, org, resolvedSearchParams] = await Promise.all([
    params,
    getDevOrganizationProfile(),
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);

  const invoice = await getInvoiceDetail(DEV_ORG_ID, id);
  if (!invoice) redirect("/invoices");

  const companyName = org?.legalName || org?.name || "LalGeo";
  const greetingName = invoice.client.name || "there";
  const defaultSubject = `${companyName} Invoice ${invoice.invoiceNumber}`;
  const defaultMessage = `Hi ${greetingName},

Please find your invoice ${invoice.invoiceNumber} from ${companyName}.
Invoice amount: ${formatCents(invoice.totalCents)}.

Please let us know once payment is made.

Thanks,`;

  const smtpError = typeof resolvedSearchParams === "object" && resolvedSearchParams?.error === "smtp";
  const sendFailed = typeof resolvedSearchParams === "object" && resolvedSearchParams?.error === "send_failed";
  const sendReason = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.reason : undefined;
  const attachmentName = `${invoice.invoiceNumber}.pdf`;
  const attachmentPreviewSrc = `${appBasePath()}/invoices/${invoice.id}/preview`;
  const exactPdfHref = `${appBasePath()}/invoices/${invoice.id}/pdf`;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Email Invoice</h1>
        <Link href={`/invoices/${invoice.id}`} className="button secondary">
          Back
        </Link>
      </div>

      {smtpError ? (
        <div className="banner">
          SMTP is not configured. Go to Settings and save Email Delivery values first.
        </div>
      ) : null}
      {sendFailed ? (
        <div className="banner">
          Email send failed. {sendReason ? `Reason: ${sendReason}` : "Check Settings integrations/provider and try again."}
        </div>
      ) : null}

      <p className="muted">Editable message + PDF attachment are included when sent.</p>

      <div className="card" style={{ marginTop: 12 }}>
        <strong>Attachment</strong>
        <p className="muted">Click the attachment below to preview the exact PDF that will be sent.</p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>{attachmentName}</summary>
          <p className="muted" style={{ marginTop: 8 }}>
            This is a fit-width preview. <a href={exactPdfHref} target="_blank" rel="noreferrer">Open exact PDF</a>.
          </p>
          <div style={{ marginTop: 12 }}>
            <iframe
              title={`${attachmentName} preview`}
              src={attachmentPreviewSrc}
              style={{ width: "100%", height: 560, border: "1px solid #d7dbe3", borderRadius: 10, background: "#fff" }}
            />
          </div>
        </details>
      </div>

      <form action={sendInvoiceEmail} className="saas-form" style={{ marginTop: 16 }}>
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <div>
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="email" className="input" required defaultValue={invoice.client.email || ""} />
        </div>
        <div>
          <label htmlFor="cc">CC (optional)</label>
          <input id="cc" name="cc" className="input" />
        </div>
        <div>
          <label htmlFor="subject">Subject</label>
          <input id="subject" name="subject" className="input" required defaultValue={defaultSubject} />
        </div>
        <div>
          <label htmlFor="message">Message</label>
          <textarea id="message" name="message" className="input" rows={10} required defaultValue={defaultMessage} />
        </div>
        <div className="saas-form-actions">
          <button type="submit" className="button">
            Send Email With PDF
          </button>
        </div>
      </form>
    </div>
  );
}
