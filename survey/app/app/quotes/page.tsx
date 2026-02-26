import Link from "next/link";
import { listQuotes } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";

export const dynamic = "force-dynamic";

type QuoteRow = {
  id: string;
  quoteNumber: string;
  status: string;
  totalCents: number;
  sentAt: Date | null;
  createdAt: Date;
  invoices: Array<{ id: string }>;
  client: {
    name: string;
  };
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function quoteStatusClass(status: string) {
  if (status === "accepted") return "status-pill success";
  if (status === "sent") return "status-pill warn";
  if (status === "rejected") return "status-pill error";
  return "status-pill";
}

export default async function AppQuotesPage() {
  const quotes = (await listQuotes(DEV_ORG_ID)) as QuoteRow[];

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Quotes</h1>
        <Link href="/quotes/new" className="button">
          New Quote
        </Link>
      </div>

      {quotes.length === 0 ? (
        <div className="saas-empty-state">
          <div>No quotes yet.</div>
          <div>Create your first quote to start billing workflow.</div>
        </div>
      ) : (
        <div className="saas-table-wrap">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Client</th>
                <th>Status</th>
                <th>Total</th>
                <th>Sent</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>{quote.quoteNumber}</td>
                  <td>{quote.client.name}</td>
                  <td>
                    <span className={quoteStatusClass(quote.status)}>{quote.status}</span>
                  </td>
                  <td>{formatCents(quote.totalCents)}</td>
                  <td>{quote.sentAt ? dateFormatter.format(quote.sentAt) : "—"}</td>
                  <td>{dateFormatter.format(quote.createdAt)}</td>
                  <td>
                    <Link href={`/quotes/${quote.id}`} className="muted">
                      View
                    </Link>
                    {" · "}
                    {quote.invoices.length > 0 ? <span className="muted">Invoiced</span> : <Link href={`/invoices/new?quoteId=${quote.id}`} className="muted">Create Invoice</Link>}
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
