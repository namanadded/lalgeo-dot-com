import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobDetail } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";

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

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const job = await getJobDetail(DEV_ORG_ID, id);

  if (!job) notFound();

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{job.title}</h1>
        <Link href="/app/jobs" className="button secondary">
          Back
        </Link>
      </div>

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
            <Link href={`/app/clients/${job.client.id}`}>View client</Link>
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
