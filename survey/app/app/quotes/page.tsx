import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteQuote, listQuotes } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type QuoteRow = {
  id: string;
  quoteNumber: string;
  status: string;
  totalCents: number;
  sentAt: Date | null;
  createdAt: Date;
  clientId?: string;
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

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function deleteQuoteAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    redirect("/quotes?error=forbidden");
  }
  const quoteId = String(formData.get("quoteId") || "").trim();
  if (!quoteId) return;
  try {
    await deleteQuote(DEV_ORG_ID, quoteId);
  } catch {
    redirect("/quotes?error=delete_failed");
  }
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  redirect("/quotes?saved=deleted");
}

export default async function AppQuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = getParam(params.q).trim().toLowerCase();
  const statusFilter = getParam(params.status).trim().toLowerCase();
  const saved = getParam(params.saved);
  const error = getParam(params.error);
  const session = await getSessionUser();
  const canManage = session?.role === "admin";

  const allQuotes = (await listQuotes(DEV_ORG_ID)) as QuoteRow[];
  const quotes = allQuotes.filter((quote) => {
    if (statusFilter && statusFilter !== "all" && quote.status.toLowerCase() !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = [quote.quoteNumber, quote.client.name, quote.status].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Quotes</h1>
        <Link href="/quotes/new" className="button">
          New Quote
        </Link>
      </div>

      {saved === "deleted" ? <div className="banner">Quote deleted.</div> : null}
      {error === "delete_failed" ? <div className="banner">Cannot delete quote once invoiced.</div> : null}
      {error === "forbidden" ? <div className="banner">Only admins can edit or delete records.</div> : null}

      <form className="saas-toolbar saas-toolbar-grid" method="get">
        <input className="input" name="q" defaultValue={getParam(params.q)} placeholder="Search quote # or client" />
        <select className="input" name="status" defaultValue={statusFilter || "all"}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {allQuotes.length === 0 ? (
        <div className="saas-empty-state saas-empty-state-cta">
          <div className="saas-empty-title">No quotes yet.</div>
          <div>Create a quote to start your sales workflow.</div>
          <div className="saas-empty-actions">
            <Link href="/quotes/new" className="button">
              Create First Quote
            </Link>
            <Link href="/clients/new" className="button secondary">
              Add Client
            </Link>
          </div>
        </div>
      ) : quotes.length === 0 ? (
        <div className="saas-empty-state">
          <div>No matching quotes.</div>
          <div>Adjust your filter or search.</div>
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
                <th>Actions</th>
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
                    <div className="saas-row-actions">
                      <Link href={`/quotes/${quote.id}`} className="muted">
                        View
                      </Link>
                      {canManage ? (
                        <Link href={`/quotes/${quote.id}/edit`} className="muted">
                          Edit
                        </Link>
                      ) : null}
                      <Link href={`/quotes/${quote.id}/email`} className="muted">
                        Send Quote
                      </Link>
                      {quote.invoices.length > 0 ? (
                        <span className="muted">Invoiced</span>
                      ) : (
                        <Link href={`/invoices/new?quoteId=${quote.id}`} className="muted">
                          Create Invoice
                        </Link>
                      )}
                      {canManage ? (
                        <form action={deleteQuoteAction}>
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <button type="submit" className="saas-inline-action saas-inline-danger">
                            Delete
                          </button>
                        </form>
                      ) : null}
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
