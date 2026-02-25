import Link from "next/link";
import { listJobs } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  title: string;
  status: string;
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

function statusClass(status: string) {
  if (status === "completed") return "status-pill success";
  if (status === "scheduled") return "status-pill warn";
  return "status-pill";
}

export default async function AppJobsPage() {
  const jobs = (await listJobs(DEV_ORG_ID)) as JobRow[];

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Jobs</h1>
        <Link href="/app/jobs/new" className="button">
          New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="saas-empty-state">
          <div>No jobs yet.</div>
          <div>Create your first job to get started.</div>
        </div>
      ) : (
        <div className="saas-table-wrap">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client Name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.title}</td>
                  <td>{job.client.name}</td>
                  <td>
                    <span className={statusClass(job.status)}>{job.status}</span>
                  </td>
                  <td>{dateFormatter.format(job.createdAt)}</td>
                  <td>
                    <Link href={`/app/jobs/${job.id}`} className="muted">
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
