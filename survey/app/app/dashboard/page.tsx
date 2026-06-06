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
import { getAssetSummary, listInvoices, listJobs, listQuotes, listRecentActivities } from "@/lib/saas-store";
import { Sparkline } from "@/components/Sparkline";

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

function trend(current: number, previous: number) {
  if (previous <= 0 && current > 0) return { text: "New growth", tone: "up" as const };
  if (previous <= 0) return { text: "No change", tone: "flat" as const };
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? "+" : "";
  if (Math.abs(delta) < 1) return { text: "Flat", tone: "flat" as const };
  return { text: `${sign}${delta.toFixed(0)}% vs prior`, tone: delta >= 0 ? ("up" as const) : ("down" as const) };
}

function bucketLastDays<T>(
  data: T[],
  days: number,
  getDate: (row: T) => Date | null,
  getValue: (row: T) => number,
): number[] {
  const now = new Date();
  const start = startOfDay(addDays(now, -days + 1));
  const buckets = Array.from({ length: days }, () => 0);
  for (const row of data) {
    const date = getDate(row);
    if (!date) continue;
    if (date < start || date > now) continue;
    const dayDiff = Math.floor((startOfDay(date).getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff >= 0 && dayDiff < days) {
      buckets[dayDiff] += getValue(row);
    }
  }
  return buckets;
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
  const fourteenDaysAgo = addDays(now, -14);
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(addDays(monthStart, -1));
  const last30Days = addDays(now, -30);
  const prev30Days = addDays(now, -60);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const next7End = endOfDay(addDays(now, 7));

  const [invoices, quotes, queueRows, activityRows, assetSummary] = await Promise.all([
    listInvoices(DEV_ORG_ID).catch(() => []),
    listQuotes(DEV_ORG_ID).catch(() => []),
    listJobs(DEV_ORG_ID).catch(() => []),
    listRecentActivities(DEV_ORG_ID, 10).catch(() => []),
    getAssetSummary(DEV_ORG_ID).catch(() => ({ total: 0, active: 0, needsAttention: 0, inactive: 0, byCondition: [], recent: [] })),
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

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const weeklySales = paidInvoices
    .filter((invoice) => isInRange(invoice.paidAt || invoice.sentAt || invoice.createdAt, sevenDaysAgo, now))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const previousWeekSales = paidInvoices
    .filter((invoice) => isInRange(invoice.paidAt || invoice.sentAt || invoice.createdAt, fourteenDaysAgo, sevenDaysAgo))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);

  const monthlySales = paidInvoices
    .filter((invoice) => isInRange(invoice.paidAt || invoice.sentAt || invoice.createdAt, monthStart, now))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const previousMonthSales = paidInvoices
    .filter((invoice) => isInRange(invoice.paidAt || invoice.sentAt || invoice.createdAt, prevMonthStart, monthStart))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);

  const outstanding = invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + invoice.totalCents, 0);

  const sentQuotesCount = quotes.filter((quote) => quote.status === "sent" && isInRange(quote.sentAt || quote.createdAt, last30Days, now)).length;
  const acceptedQuotesCount = quotes.filter((quote) => quote.status === "accepted" && isInRange(quote.sentAt || quote.createdAt, last30Days, now)).length;
  const prevSentQuotesCount = quotes.filter((quote) => quote.status === "sent" && isInRange(quote.sentAt || quote.createdAt, prev30Days, last30Days)).length;

  const weeklyTrend = trend(weeklySales, previousWeekSales);
  const monthlyTrend = trend(monthlySales, previousMonthSales);
  const quotesTrend = trend(sentQuotesCount, prevSentQuotesCount);

  const paidSeries = bucketLastDays(
    paidInvoices,
    14,
    (invoice) => invoice.paidAt || invoice.sentAt || invoice.createdAt,
    (invoice) => invoice.totalCents,
  );

  const quoteSeries = bucketLastDays(
    quotes,
    14,
    (quote) => quote.sentAt || quote.createdAt,
    (quote) => (quote.status === "sent" || quote.status === "accepted" ? 1 : 0),
  );

  const noData = invoices.length === 0 && quotes.length === 0 && queueRows.length === 0 && assetSummary.total === 0;

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
        <Link href="/assets/new" className="button secondary">
          New Asset
        </Link>
      </div>

      {noData ? (
        <div className="saas-empty-state saas-empty-state-cta">
          <div className="saas-empty-title">Your asset workspace is ready.</div>
          <div>Add your first asset record or client to unlock operational metrics.</div>
          <div className="saas-empty-actions">
            <Link href="/assets/new" className="button">
              Add First Asset
            </Link>
            <Link href="/clients/new" className="button">
              Add First Client
            </Link>
            <Link href="/quotes/new" className="button secondary">
              Create First Quote
            </Link>
          </div>
        </div>
      ) : null}

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-header">
            <div className="dashboard-kpi-label">Weekly Sales</div>
            <span className={`dashboard-trend ${weeklyTrend.tone}`}>{weeklyTrend.text}</span>
          </div>
          <div className="dashboard-kpi-value">{formatCurrencyFromCents(weeklySales)}</div>
          <Sparkline values={paidSeries} color="#0a84ff" />
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-header">
            <div className="dashboard-kpi-label">Monthly Sales</div>
            <span className={`dashboard-trend ${monthlyTrend.tone}`}>{monthlyTrend.text}</span>
          </div>
          <div className="dashboard-kpi-value">{formatCurrencyFromCents(monthlySales)}</div>
          <div className="muted">Current month paid invoices</div>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-header">
            <div className="dashboard-kpi-label">Outstanding</div>
          </div>
          <div className="dashboard-kpi-value">{formatCurrencyFromCents(outstanding)}</div>
          <div className="muted">Open receivables</div>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-header">
            <div className="dashboard-kpi-label">Quotes Sent (30d)</div>
            <span className={`dashboard-trend ${quotesTrend.tone}`}>{quotesTrend.text}</span>
          </div>
          <div className="dashboard-kpi-value">{sentQuotesCount}</div>
          <Sparkline values={quoteSeries} color="#2c9b68" />
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-header">
            <div className="dashboard-kpi-label">Quote Conversion</div>
          </div>
          <div className="dashboard-kpi-value">{percent(acceptedQuotesCount, sentQuotesCount)}</div>
          <div className="muted">
            {acceptedQuotesCount} accepted / {sentQuotesCount} sent
          </div>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-header">
            <div className="dashboard-kpi-label">Assets</div>
          </div>
          <div className="dashboard-kpi-value">{assetSummary.total}</div>
          <div className="muted">{assetSummary.needsAttention} need attention</div>
        </div>
      </div>

      <div className="dashboard-section-grid">
        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Today</div>
          {todayQueue.length === 0 ? (
            <div className="saas-empty-state">
              <div>No appointments today.</div>
              <div className="saas-empty-actions">
                <Link href="/jobs/new" className="button secondary">
                  Schedule Job
                </Link>
              </div>
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
              <div className="saas-empty-actions">
                <Link href="/jobs/new" className="button secondary">
                  Add Future Job
                </Link>
              </div>
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
            <div className="saas-empty-actions">
              <Link href="/quotes/new" className="button secondary">
                Create Quote
              </Link>
              <Link href="/invoices/new" className="button secondary">
                Create Invoice
              </Link>
            </div>
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
