import Link from "next/link";
import { redirect } from "next/navigation";
import { createQuote as createQuoteRecord, listClients, listJobs } from "@/lib/saas-store";
import { DEV_ORG_ID, ensureDevOrganization } from "@/lib/saas";
import { computeQuoteTotals, dollarsToCents, nextQuoteNumber, type QuoteDraftLine } from "@/lib/quotes";

const LINE_SLOTS = 5;

async function createQuote(formData: FormData) {
  "use server";

  const clientId = String(formData.get("clientId") || "").trim();
  const jobIdRaw = String(formData.get("jobId") || "").trim();
  const notesRaw = String(formData.get("notes") || "").trim();
  const statusRaw = String(formData.get("status") || "draft").trim();
  const status = statusRaw === "sent" || statusRaw === "accepted" || statusRaw === "rejected" ? statusRaw : "draft";
  const taxRatePercentRaw = Number(String(formData.get("taxRatePercent") || "5").trim());
  const taxRatePercent = Number.isFinite(taxRatePercentRaw) && taxRatePercentRaw >= 0 ? taxRatePercentRaw : 5;
  const taxRateBps = Math.round(taxRatePercent * 100);

  if (!clientId) return;

  const descriptions = formData.getAll("lineDescription").map((v) => String(v || "").trim());
  const quantities = formData.getAll("lineQty").map((v) => Number(String(v || "").trim() || "0"));
  const unitPrices = formData.getAll("lineUnitPrice").map((v) => dollarsToCents(String(v || "")));

  const draftLines: QuoteDraftLine[] = descriptions.map((description, idx) => ({
    description,
    quantity: Number.isFinite(quantities[idx]) ? Math.max(0, Math.floor(quantities[idx])) : 0,
    unitPriceCents: unitPrices[idx] || 0,
  }));

  const computed = computeQuoteTotals(draftLines, taxRateBps);
  if (computed.lineItems.length === 0) return;

  await ensureDevOrganization();
  const quoteNumber = await nextQuoteNumber();

  await createQuoteRecord({
    organizationId: DEV_ORG_ID,
    quoteNumber,
    status,
    notes: notesRaw || null,
    clientId,
    jobId: jobIdRaw || null,
    subtotalCents: computed.subtotalCents,
    taxRateBps,
    taxCents: computed.taxCents,
    totalCents: computed.totalCents,
    lineItems: computed.lineItems.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
      sortOrder: line.sortOrder,
    })),
  });

  redirect("/app/quotes");
}

export default async function NewQuotePage() {
  const [clients, jobs] = await Promise.all([listClients(DEV_ORG_ID), listJobs(DEV_ORG_ID)]);

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>New Quote</h1>
        <Link href="/app/quotes" className="button secondary">
          Back
        </Link>
      </div>

      <form action={createQuote} className="saas-form">
        <div>
          <label htmlFor="clientId">Client</label>
          <select id="clientId" name="clientId" className="input" required defaultValue="">
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="jobId">Linked Job (optional)</label>
          <select id="jobId" name="jobId" className="input" defaultValue="">
            <option value="">None</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue="draft">
            <option value="draft">draft</option>
            <option value="sent">sent</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
          </select>
        </div>

        <div>
          <label htmlFor="taxRatePercent">Tax Rate (%)</label>
          <input
            id="taxRatePercent"
            name="taxRatePercent"
            className="input"
            type="number"
            min="0"
            step="0.01"
            defaultValue="5.00"
          />
        </div>

        <div>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="input" rows={3} />
        </div>

        <div className="saas-line-items">
          <label>Line Items</label>
          {Array.from({ length: LINE_SLOTS }).map((_, idx) => (
            <div key={idx} className="saas-line-item-row">
              <input
                name="lineDescription"
                className="input"
                placeholder={`Item ${idx + 1} description`}
              />
              <input
                name="lineQty"
                className="input"
                type="number"
                min="0"
                step="1"
                defaultValue={idx === 0 ? "1" : ""}
                placeholder="Qty"
              />
              <input
                name="lineUnitPrice"
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit $"
              />
            </div>
          ))}
        </div>

        <div className="saas-form-actions">
          <button type="submit" className="button" disabled={clients.length === 0}>
            Create Quote
          </button>
        </div>
      </form>
    </div>
  );
}
