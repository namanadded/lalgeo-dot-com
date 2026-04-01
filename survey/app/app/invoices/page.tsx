import Link from "next/link";
import { revalidatePath } from "next/cache";
import { listInvoices, markInvoicePaid } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { invoiceStatusClass } from "@/lib/invoices";
import { formatCents } from "@/lib/quotes";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  paidCents: number;
  sentAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  client: {
    name: string;
  };
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function markPaidAction(formData: FormData) {
  "use server";
  const invoiceId = String(formData.get("invoiceId") || "").trim();
  if (!invoiceId) return;
  await markInvoicePaid(DEV_ORG_ID, invoiceId);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath(`/invoices/${invoiceId}`);
}

export default async function AppInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = getParam(params.q).trim().toLowerCase();
  const statusFilter = getParam(params.status).trim().toLowerCase();

  const allInvoices = (await listInvoices(DEV_ORG_ID)) as InvoiceRow[];
  const invoices = allInvoices.filter((invoice) => {
    if (statusFilter && statusFilter !== "all" && invoice.status.toLowerCase() !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = [invoice.invoiceNumber, invoice.client.name, invoice.status].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Invoices</h1>
        <Link href="/invoices/new" className="button">
          New Invoice
        </Link>
      </div>

      <form className="saas-toolbar saas-toolbar-grid" method="get">
        <input className="input" name="q" defaultValue={getParam(params.q)} placeholder="Search invoice # or client" />
        <select className="input" name="status" defaultValue={statusFilter || "all"}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {allInvoices.length === 0 ? (
        <div className="saas-empty-state saas-empty-state-cta">
          <div className="saas-empty-title">No invoices yet.</div>
          <div>Create your first invoice to start collecting payments.</div>
          <div className="saas-empty-actions">
            <Link href="/invoices/new" className="button">
              Create First Invoice
            </Link>
            <Link href="/quotes" className="button secondary">
              Use Existing Quote
            </Link>
          </div>
        </div>
      ) : invoices.length === 0 ? (
        <div className="saas-empty-state">
          <div>No matching invoices.</div>
          <div>Adjust your filter or search term.</div>
        </div>
      ) : (
        <div className="saas-table-wrap">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Sent</th>
                <th>Due</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.client.name}</td>
                  <td>
                    <span className={invoiceStatusClass(invoice.status)}>{invoice.status}</span>
                  </td>
                  <td>{formatCents(invoice.totalCents)}</td>
                  <td>{formatCents(invoice.paidCents)}</td>
                  <td>{invoice.sentAt ? dateFormatter.format(invoice.sentAt) : "—"}</td>
                  <td>{invoice.dueAt ? dateFormatter.format(invoice.dueAt) : "—"}</td>
                  <td>{dateFormatter.format(invoice.createdAt)}</td>
                  <td>
                    <div className="saas-row-actions">
                      <Link href={`/invoices/${invoice.id}`} className="muted">
                        View
                      </Link>
                      {invoice.status !== "paid" ? (
                        <form action={markPaidAction}>
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <button type="submit" className="saas-inline-action">
                            Mark Paid
                          </button>
                        </form>
                      ) : (
                        <span className="muted">Paid</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
