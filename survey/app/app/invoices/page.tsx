import Link from "next/link";
import { listInvoices } from "@/lib/saas-store";
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

export default async function AppInvoicesPage() {
  const invoices = (await listInvoices(DEV_ORG_ID)) as InvoiceRow[];

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Invoices</h1>
        <Link href="/invoices/new" className="button">
          New Invoice
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div className="saas-empty-state">
          <div>No invoices yet.</div>
          <div>Create one from a quote to start tracking receivables.</div>
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
                <th>Action</th>
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
                    <Link href={`/invoices/${invoice.id}`} className="muted">
                      View
                    </Link>
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
