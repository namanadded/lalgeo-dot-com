import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getQuoteDetail, updateQuote } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { requireAdmin } from "@/lib/rbac";

async function updateQuoteAction(quoteId: string, formData: FormData) {
  "use server";
  await requireAdmin("/quotes?error=forbidden");
  const statusRaw = String(formData.get("status") || "draft").trim();
  const status = ["draft", "sent", "accepted", "rejected"].includes(statusRaw) ? statusRaw : "draft";
  const notes = String(formData.get("notes") || "").trim() || null;
  await updateQuote(DEV_ORG_ID, quoteId, { status, notes });
  redirect(`/quotes/${quoteId}?saved=1`);
}

export const dynamic = "force-dynamic";

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/quotes?error=forbidden");
  const { id } = await params;
  const quote = await getQuoteDetail(DEV_ORG_ID, id);
  if (!quote) notFound();

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Edit Quote</h1>
        <Link href={`/quotes/${quote.id}`} className="button secondary">
          Back
        </Link>
      </div>

      <form action={updateQuoteAction.bind(null, quote.id)} className="saas-form">
        <div>
          <label>Quote Number</label>
          <input className="input" value={quote.quoteNumber} readOnly />
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={quote.status}>
            <option value="draft">draft</option>
            <option value="sent">sent</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input" rows={6} defaultValue={quote.notes || ""} />
        </div>
        <div className="saas-form-actions">
          <button type="submit" className="button">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
