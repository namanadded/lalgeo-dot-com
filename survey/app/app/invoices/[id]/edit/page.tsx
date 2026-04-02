import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getInvoiceDetail, updateInvoice } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { requireAdmin } from "@/lib/rbac";

function toDateInput(date: Date | null) {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function updateInvoiceAction(invoiceId: string, formData: FormData) {
  "use server";
  await requireAdmin("/invoices?error=forbidden");
  const statusRaw = String(formData.get("status") || "draft").trim();
  const status = ["draft", "sent", "paid", "overdue"].includes(statusRaw) ? statusRaw : "draft";
  const dueAtRaw = String(formData.get("dueAt") || "").trim();
  const dueAt = dueAtRaw ? new Date(`${dueAtRaw}T00:00:00`) : null;
  const notes = String(formData.get("notes") || "").trim() || null;
  await updateInvoice(DEV_ORG_ID, invoiceId, {
    status,
    notes,
    dueAt: dueAt && Number.isFinite(dueAt.getTime()) ? dueAt : null,
  });
  redirect(`/invoices/${invoiceId}?saved=1`);
}

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/invoices?error=forbidden");
  const { id } = await params;
  const invoice = await getInvoiceDetail(DEV_ORG_ID, id);
  if (!invoice) notFound();

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Edit Invoice</h1>
        <Link href={`/invoices/${invoice.id}`} className="button secondary">
          Back
        </Link>
      </div>

      <form action={updateInvoiceAction.bind(null, invoice.id)} className="saas-form">
        <div>
          <label>Invoice Number</label>
          <input className="input" value={invoice.invoiceNumber} readOnly />
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={invoice.status}>
            <option value="draft">draft</option>
            <option value="sent">sent</option>
            <option value="paid">paid</option>
            <option value="overdue">overdue</option>
          </select>
        </div>
        <div>
          <label htmlFor="dueAt">Due Date</label>
          <input id="dueAt" name="dueAt" className="input" type="date" defaultValue={toDateInput(invoice.dueAt || null)} />
        </div>
        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input" rows={6} defaultValue={invoice.notes || ""} />
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
