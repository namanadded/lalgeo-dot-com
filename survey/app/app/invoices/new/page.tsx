import Link from "next/link";
import { redirect } from "next/navigation";
import { nextInvoiceNumber } from "@/lib/invoices";
import { createInvoiceFromQuote, listQuotes } from "@/lib/saas-store";
import { DEV_ORG_ID, ensureDevOrganization } from "@/lib/saas";

type SearchParams = Promise<{ quoteId?: string }> | { quoteId?: string } | undefined;

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

async function createInvoice(formData: FormData) {
  "use server";

  const quoteId = String(formData.get("quoteId") || "").trim();
  const statusRaw = String(formData.get("status") || "draft").trim();
  const notesRaw = String(formData.get("notes") || "").trim();
  const dueInDays = parsePositiveInt(String(formData.get("dueInDays") || "14").trim(), 14);
  const status = statusRaw === "draft" || statusRaw === "sent" || statusRaw === "paid" || statusRaw === "overdue"
    ? statusRaw
    : "draft";

  if (!quoteId) return;

  await ensureDevOrganization();

  const invoiceNumber = await nextInvoiceNumber();
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueInDays);

  await createInvoiceFromQuote({
    organizationId: DEV_ORG_ID,
    quoteId,
    invoiceNumber,
    status,
    notes: notesRaw || null,
    dueAt,
  });

  redirect("/invoices");
}

export default async function NewInvoicePage({ searchParams }: { searchParams?: SearchParams }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const preselectedQuoteId = resolvedSearchParams?.quoteId || "";

  const quotes = await listQuotes(DEV_ORG_ID, { uninvoiced: true });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>New Invoice</h1>
        <Link href="/invoices" className="button secondary">
          Back
        </Link>
      </div>

      <form action={createInvoice} className="saas-form">
        <div>
          <label htmlFor="quoteId">Quote</label>
          <select id="quoteId" name="quoteId" className="input" required defaultValue={preselectedQuoteId}>
            <option value="" disabled>
              Select a quote
            </option>
            {quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.quoteNumber} · {quote.client.name} ({quote.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status">Invoice Status</label>
          <select id="status" name="status" className="input" defaultValue="draft">
            <option value="draft">draft</option>
            <option value="sent">sent</option>
            <option value="paid">paid</option>
            <option value="overdue">overdue</option>
          </select>
        </div>

        <div>
          <label htmlFor="dueInDays">Due In (days)</label>
          <input id="dueInDays" name="dueInDays" className="input" type="number" min="0" step="1" defaultValue="14" />
        </div>

        <div>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="input" rows={3} />
        </div>

        <div className="saas-form-actions">
          <button type="submit" className="button" disabled={quotes.length === 0}>
            Create Invoice
          </button>
        </div>
      </form>
    </div>
  );
}
