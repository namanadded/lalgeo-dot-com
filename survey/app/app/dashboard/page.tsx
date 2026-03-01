import Link from "next/link";
import { DEV_ORG_ID } from "@/lib/saas";
import {
  addDays,
  endOfDay,
  formatCurrencyFromCents,
  formatShortDateTime,
  startOfDay,
  startOfMonth,
} from "@/lib/dashboard-utils";
import { listInvoices, listJobs, listQuotes, listRecentActivities } from "@/lib/saas-store";

export const dynamic = "force-dynamic";

function statusClass(status: string) {
  if (status === "completed" || status === "paid" || status === "accepted") return "status-pill success";
  if (status === "scheduled" || status === "sent") return "status-pill warn";
  if (status === "overdue" || status === "rejected") return "status-pill error";
  return "status-pill";
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  const ratio = (numerator / denominator) * 100;
  return `${ratio.toFixed(0)}%`;
}

type QueueRow = {
  id: string;
  title: string;
  status: string;
  scheduledStart: Date | null;
  inspectionDueDate: Date | null;
  client: { name: string };
};

function isInRange(date: Date | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export default async function AppDashboardPage() {
  const now = new Date();
  const sevenDaysAgo = addDays(now, -7);
  const monthStart = startOfMonth(now);
  const last30Days = addDays(now, -30);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const next7End = endOfDay(addDays(now, 7));

  const [invoices, quotes, queueRows, activityRows] = await Promise.all([
    listInvoices(DEV_ORG_ID).catch(() => []),
    listQuotes(DEV_ORG_ID).catch(() => []),
    listJobs(DEV_ORG_ID).catch(() => []),
    listRecentActivities(DEV_ORG_ID, 10).catch(() => []),
  ]);

  const queueSorted = (queueRows as QueueRow[]).sort((a, b) => {
    const aDate = a.scheduledStart || a.inspectionDueDate || new Date(0);
    const bDate = b.scheduledStart || b.inspectionDueDate || new Date(0);
    return aDate.getTime() - bDate.getTime();
  });

  const todayQueue = queueSorted.filter((row) => {
    const when = row.scheduledStart || row.inspectionDueDate;
    return when && when >= todayStart && when <= todayEnd;
  });
  const next7Queue = queueSorted.filter((row) => {
    const when = row.scheduledStart || row.inspectionDueDate;
    return when && when > todayEnd && when <= next7End;
  });

  const weeklySales = invoices
    .filter((invoice) => invoice.status === "paid" && isInRange(invoice.paidAt || invoice.sentAt || invoice.createdAt, sevenDaysAgo, now))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const monthlySales = invoices
    .filter((invoice) => invoice.status === "paid" && isInRange(invoice.paidAt || invoice.sentAt || invoice.createdAt, monthStart, now))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const outstanding = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const sentQuotesCount = quotes.filter((quote) => quote.status === "sent" && isInRange(quote.sentAt || quote.createdAt, last30Days, now)).length;
  const acceptedQuotesCount = quotes.filter((quote) => quote.status === "accepted" && isInRange(quote.sentAt || quote.createdAt, last30Days, now)).length;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Dashboard</h1>
      </div>

      <div className="dashboard-quick-actions">
        <Link href="/quotes/new" className="button">
          New Quote
        </Link>
        <Link href="/invoices/new" className="button secondary">
          New Invoice
        </Link>
        <Link href="/clients/new" className="button secondary">
          New Client
        </Link>
        <Link href="/jobs/new" className="button secondary">
          Schedule Job
        </Link>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Weekly Sales</div>
          <div className="dashboard-kpi-value">{formatCurrencyFromCents(weeklySales)}</div>
          <div className="muted">Last 7 days (paid invoices)</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Monthly Sales</div>
          <div className="dashboard-kpi-value">{formatCurrencyFromCents(monthlySales)}</div>
          <div className="muted">Current month (paid invoices)</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Outstanding</div>
          <div className="dashboard-kpi-value">{formatCurrencyFromCents(outstanding)}</div>
          <div className="muted">All unpaid invoices</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Quotes Sent (30d)</div>
          <div className="dashboard-kpi-value">{sentQuotesCount}</div>
          <div className="muted">Quotes with sent status</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Quote Conversion</div>
          <div className="dashboard-kpi-value">{percent(acceptedQuotesCount, sentQuotesCount)}</div>
          <div className="muted">
            {acceptedQuotesCount} accepted / {sentQuotesCount} sent
          </div>
        </div>
      </div>

      <div className="dashboard-section-grid">
        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Today</div>
          {todayQueue.length === 0 ? (
            <div className="saas-empty-state">
              <div>No appointments today.</div>
              <div>Use “Schedule Job” to add work for today.</div>
            </div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {todayQueue.map((row) => {
                    const when = row.scheduledStart || row.inspectionDueDate;
                    return (
                      <tr key={row.id}>
                        <td>{formatShortDateTime(when)}</td>
                        <td>{row.client.name}</td>
                        <td>{row.title}</td>
                        <td>
                          <span className={statusClass(row.status)}>{row.status}</span>
                        </td>
                        <td>
                          <Link href={`/jobs/${row.id}`} className="muted">
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Next 7 days</div>
          {next7Queue.length === 0 ? (
            <div className="saas-empty-state">
              <div>No upcoming scheduled work.</div>
              <div>Add future jobs to keep your pipeline visible.</div>
            </div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {next7Queue.map((row) => {
                    const when = row.scheduledStart || row.inspectionDueDate;
                    return (
                      <tr key={row.id}>
                        <td>{formatShortDateTime(when)}</td>
                        <td>{row.client.name}</td>
                        <td>{row.title}</td>
                        <td>
                          <span className={statusClass(row.status)}>{row.status}</span>
                        </td>
                        <td>
                          <Link href={`/jobs/${row.id}`} className="muted">
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-section-card">
        <div className="dashboard-section-title">Recent Activity</div>
        {activityRows.length === 0 ? (
          <div className="saas-empty-state">
            <div>No activity yet.</div>
            <div>Create a quote, invoice, or job to start tracking activity.</div>
          </div>
        ) : (
          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Message</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((activity) => (
                  <tr key={activity.id}>
                    <td>{formatShortDateTime(activity.createdAt)}</td>
                    <td>
                      <span className="status-pill">{activity.action}</span>
                    </td>
                    <td>{activity.message}</td>
                    <td>
                      {activity.entityType}:{activity.entityId.slice(0, 8)}
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
