import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobDetail } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { getSessionUser } from "@/lib/auth";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function statusClass(status: string) {
  if (status === "completed") return "status-pill success";
  if (status === "scheduled") return "status-pill warn";
  return "status-pill";
}

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }> | { saved?: string };
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams ? searchParams : Promise.resolve(undefined)]);
  const session = await getSessionUser();

  const job = await getJobDetail(DEV_ORG_ID, id);

  if (!job) notFound();
  const saved = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.saved : undefined;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{job.title}</h1>
        <div className="saas-row-actions">
          {session?.role === "admin" ? (
            <Link href={`/jobs/${job.id}/edit`} className="button secondary">
              Edit Job
            </Link>
          ) : null}
          <Link href="/jobs" className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {saved === "1" ? <div className="banner">Job updated.</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <strong>Job Details</strong>
          <p className="muted">
            Status: <span className={statusClass(job.status)}>{job.status}</span>
          </p>
          <p className="muted">Created: {dateFormatter.format(job.createdAt)}</p>
        </div>

        <div className="card">
          <strong>Client</strong>
          <p className="muted">{job.client.name}</p>
          <p className="muted">
            <Link href={`/clients/${job.client.id}`}>View client</Link>
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <strong>Quotes</strong>
          <p className="muted">{job._count.quotes}</p>
        </div>
        <div className="card">
          <strong>Invoices</strong>
          <p className="muted">{job._count.invoices}</p>
        </div>
      </div>
    </div>
  );
}
