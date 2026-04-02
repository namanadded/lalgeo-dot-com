import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientDetail } from "@/lib/saas-store";
import { AppleAddressPreview } from "@/components/AppleAddressPreview";
import { DEV_ORG_ID } from "@/lib/saas";
import { formatCents } from "@/lib/quotes";
import { invoiceStatusClass } from "@/lib/invoices";
import { getSessionUser } from "@/lib/auth";

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

function jobStatusClass(status: string) {
  if (status === "completed") return "status-pill success";
  if (status === "scheduled") return "status-pill warn";
  return "status-pill";
}

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }> | { saved?: string };
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams ? searchParams : Promise.resolve(undefined)]);
  const session = await getSessionUser();

  const client = await getClientDetail(DEV_ORG_ID, id);
  if (!client) notFound();

  const address = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.stateProvince].filter(Boolean).join(", "),
    [client.postalCode, client.country].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  const saved = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.saved : undefined;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{client.name}</h1>
        <div className="saas-row-actions">
          {session?.role === "admin" ? (
            <Link href={`/clients/${client.id}/edit`} className="button secondary">
              Edit Client
            </Link>
          ) : null}
          <Link href={`/jobs/new?clientId=${encodeURIComponent(client.id)}`} className="button secondary">
            Create Job
          </Link>
          <Link href={`/quotes/new?clientId=${encodeURIComponent(client.id)}`} className="button secondary">
            New Quote
          </Link>
          <Link href="/clients" className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {saved === "1" ? <div className="banner">Client updated.</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <strong>Contact</strong>
          <p className="muted">Company: {client.companyName || "—"}</p>
          <p className="muted">Email: {client.email || "—"}</p>
          <p className="muted">Phone: {client.phone || "—"}</p>
          <p className="muted">Address: {address || "—"}</p>
          <p className="muted">Created: {dateFormatter.format(client.createdAt)}</p>
        </div>

        <div className="card">
          <strong>Summary</strong>
          <p className="muted">Jobs: {client._count.jobs}</p>
          <p className="muted">Quotes: {client._count.quotes}</p>
          <p className="muted">Invoices: {client._count.invoices}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Notes</strong>
        <p className="muted">{client.notes || "No notes yet."}</p>
      </div>

      {address ? <AppleAddressPreview address={address} name={client.name} /> : null}

      <div className="dashboard-section-grid" style={{ marginTop: 16 }}>
        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Recent Jobs</div>
          {!client.jobs?.length ? (
            <div className="saas-empty-state">
              <div>No jobs yet.</div>
              <div className="saas-empty-actions">
                <Link href={`/jobs/new?clientId=${encodeURIComponent(client.id)}`} className="button secondary">
                  Create Job
                </Link>
              </div>
            </div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {client.jobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.title}</td>
                      <td>
                        <span className={jobStatusClass(job.status)}>{job.status}</span>
                      </td>
                      <td>{dateFormatter.format(job.createdAt)}</td>
                      <td>
                        <Link href={`/jobs/${job.id}`} className="muted">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Recent Quotes</div>
          {!client.quotes?.length ? (
            <div className="saas-empty-state">
              <div>No quotes yet.</div>
              <div className="saas-empty-actions">
                <Link href={`/quotes/new?clientId=${encodeURIComponent(client.id)}`} className="button secondary">
                  Create Quote
                </Link>
              </div>
            </div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Quote</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {client.quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.quoteNumber}</td>
                      <td>
                        <span className={quoteStatusClass(quote.status)}>{quote.status}</span>
                      </td>
                      <td>{formatCents(quote.totalCents)}</td>
                      <td>
                        <Link href={`/quotes/${quote.id}`} className="muted">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-section-card" style={{ marginTop: 14 }}>
        <div className="dashboard-section-title">Recent Invoices</div>
        {!client.invoices?.length ? (
          <div className="saas-empty-state">
            <div>No invoices yet.</div>
            <div>Convert a quote into an invoice to begin payment tracking.</div>
          </div>
        ) : (
          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {client.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>
                      <span className={invoiceStatusClass(invoice.status)}>{invoice.status}</span>
                    </td>
                    <td>{formatCents(invoice.totalCents)}</td>
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
      </section>
    </div>
  );
}
