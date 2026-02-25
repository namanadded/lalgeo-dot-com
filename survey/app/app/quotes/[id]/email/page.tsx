import Link from "next/link";
import { redirect } from "next/navigation";
import { createEmailLog, getQuoteDetail, markQuoteSent } from "@/lib/saas-store";
import { DEV_ORG_ID, getDevOrganizationProfile } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";
import { buildQuotePdf } from "@/lib/pdf";
import { sendOrganizationEmail } from "@/lib/email-delivery";
import { renderDocumentEmailHtml } from "@/lib/email-template";
import { appBasePath } from "@/lib/url";

export const dynamic = "force-dynamic";

async function sendQuoteEmail(formData: FormData) {
  "use server";

  const quoteId = String(formData.get("quoteId") || "").trim();
  const to = String(formData.get("to") || "").trim();
  const ccRaw = String(formData.get("cc") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const message = String(formData.get("message") || "").trim();
  if (!quoteId || !to || !subject || !message) return;

  const [org, quote] = await Promise.all([
    getDevOrganizationProfile(),
    getQuoteDetail(DEV_ORG_ID, quoteId),
  ]);

  if (!quote) return;

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

  const pdf = buildQuotePdf({
    companyName,
    companyAddress,
    companyPhone: org?.phone || "",
    companyEmail: org?.email || "",
    documentNumber: quote.quoteNumber,
    dateLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
      quote.createdAt,
    ),
    clientName: quote.client.name,
    clientAddress,
    clientPhone: quote.client.phone || "",
    lines: quote.lineItems.map((line) => ({
      description: `${line.description}${line.quantity > 1 ? ` (x${line.quantity})` : ""}`,
      amount: formatCents(line.lineTotalCents),
    })),
    subtotal: formatCents(quote.subtotalCents),
    tax: formatCents(quote.taxCents),
    total: formatCents(quote.totalCents),
    notes: quote.notes || "",
  });

  const html = renderDocumentEmailHtml({
    companyName,
    logoUrl: org?.logoUrl,
    subject,
    preface: `Please find your quote ${quote.quoteNumber} from ${companyName}.`,
    message,
    documentNumber: quote.quoteNumber,
    clientName: quote.client.name,
    total: formatCents(quote.totalCents),
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
          filename: `${quote.quoteNumber}.pdf`,
          contentType: "application/pdf",
          content: pdf,
        },
      ],
    });
    await createEmailLog({
      organizationId: DEV_ORG_ID,
      documentType: "quote",
      documentId: quoteId,
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
      documentType: "quote",
      documentId: quoteId,
      status: "failed",
      recipientTo: to,
      recipientCc: ccRaw || null,
      subject,
      errorMessage: message.slice(0, 500),
    });
    redirect(`/app/quotes/${quoteId}/email?error=send_failed&reason=${encodeURIComponent(message.slice(0, 200))}`);
  }

  await markQuoteSent(DEV_ORG_ID, quoteId, "sent");

  redirect(`/app/quotes/${quoteId}?emailed=1`);
}

export default async function QuoteEmailPage({
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

  const quote = await getQuoteDetail(DEV_ORG_ID, id);

  if (!quote) {
    redirect("/app/quotes");
  }

  const companyName = org?.legalName || org?.name || "LalGeo";
  const greetingName = quote.client.name || "there";
  const defaultSubject = `${companyName} Quote ${quote.quoteNumber}`;
  const defaultMessage = `Hi ${greetingName},

Please find your quote ${quote.quoteNumber} from ${companyName}.
Quoted amount: ${formatCents(quote.totalCents)}.

Let us know if you would like us to proceed.

Thanks,`;
  const smtpError = typeof resolvedSearchParams === "object" && resolvedSearchParams?.error === "smtp";
  const sendFailed = typeof resolvedSearchParams === "object" && resolvedSearchParams?.error === "send_failed";
  const sendReason = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.reason : undefined;
  const attachmentName = `${quote.quoteNumber}.pdf`;
  const attachmentPreviewSrc = `${appBasePath()}/app/quotes/${quote.id}/preview`;
  const exactPdfHref = `${appBasePath()}/app/quotes/${quote.id}/pdf`;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Email Quote</h1>
        <Link href={`/app/quotes/${quote.id}`} className="button secondary">
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

      <form action={sendQuoteEmail} className="saas-form" style={{ marginTop: 16 }}>
        <input type="hidden" name="quoteId" value={quote.id} />
        <div>
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="email" className="input" required defaultValue={quote.client.email || ""} />
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
