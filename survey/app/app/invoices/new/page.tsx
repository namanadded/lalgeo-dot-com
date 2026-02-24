import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { nextInvoiceNumber } from "@/lib/invoices";
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

  const existing = await prisma.invoice.findFirst({
    where: {
      organizationId: DEV_ORG_ID,
      quoteId,
    },
    select: { id: true },
  });
  if (existing) {
    redirect("/app/invoices");
  }

  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      organizationId: DEV_ORG_ID,
    },
    select: {
      id: true,
      notes: true,
      subtotalCents: true,
      taxRateBps: true,
      taxCents: true,
      totalCents: true,
      clientId: true,
      jobId: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          description: true,
          quantity: true,
          unitPriceCents: true,
          lineTotalCents: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!quote || quote.lineItems.length === 0) return;

  const invoiceNumber = await nextInvoiceNumber();
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueInDays);

  await prisma.invoice.create({
    data: {
      organizationId: DEV_ORG_ID,
      invoiceNumber,
      status,
      notes: notesRaw || quote.notes || null,
      issuedAt: new Date(),
      dueAt,
      subtotalCents: quote.subtotalCents,
      taxRateBps: quote.taxRateBps,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      paidCents: status === "paid" ? quote.totalCents : 0,
      clientId: quote.clientId,
      jobId: quote.jobId,
      quoteId: quote.id,
      lineItems: {
        create: quote.lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          sortOrder: line.sortOrder,
        })),
      },
    },
  });

  redirect("/app/invoices");
}

export default async function NewInvoicePage({ searchParams }: { searchParams?: SearchParams }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const preselectedQuoteId = resolvedSearchParams?.quoteId || "";

  const quotes = await prisma.quote.findMany({
    where: {
      organizationId: DEV_ORG_ID,
      invoices: { none: {} },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      client: {
        select: { name: true },
      },
    },
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>New Invoice</h1>
        <Link href="/app/invoices" className="button secondary">
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
