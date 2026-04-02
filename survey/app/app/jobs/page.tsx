import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteJob, listJobs } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  scheduledStart: Date | null;
  clientId: string;
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

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function deleteJobAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    redirect("/jobs?error=forbidden");
  }
  const jobId = String(formData.get("jobId") || "").trim();
  if (!jobId) return;
  try {
    await deleteJob(DEV_ORG_ID, jobId);
  } catch {
    redirect("/jobs?error=delete_failed");
  }
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/jobs?saved=deleted");
}

export default async function AppJobsPage({
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

  const allJobs = (await listJobs(DEV_ORG_ID)) as JobRow[];
  const jobs = allJobs.filter((job) => {
    if (statusFilter && statusFilter !== "all" && job.status.toLowerCase() !== statusFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = [job.title, job.client.name, job.status].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Jobs</h1>
        <Link href="/jobs/new" className="button">
          New Job
        </Link>
      </div>

      {saved === "deleted" ? <div className="banner">Job deleted.</div> : null}
      {error === "delete_failed" ? <div className="banner">Cannot delete this job because it is linked to quotes/invoices.</div> : null}
      {error === "forbidden" ? <div className="banner">Only admins can edit or delete records.</div> : null}

      <form className="saas-toolbar saas-toolbar-grid" method="get">
        <input className="input" name="q" defaultValue={getParam(params.q)} placeholder="Search title or client" />
        <select className="input" name="status" defaultValue={statusFilter || "all"}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {allJobs.length === 0 ? (
        <div className="saas-empty-state saas-empty-state-cta">
          <div className="saas-empty-title">No jobs yet.</div>
          <div>Start your work queue by scheduling your first job.</div>
          <div className="saas-empty-actions">
            <Link href="/jobs/new" className="button">
              Schedule First Job
            </Link>
            <Link href="/clients/new" className="button secondary">
              Add Client
            </Link>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="saas-empty-state">
          <div>No matching jobs.</div>
          <div>Adjust your filters to see more work items.</div>
        </div>
      ) : (
        <div className="saas-table-wrap">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client Name</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Created</th>
                <th>Actions</th>
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
                  <td>{job.scheduledStart ? dateFormatter.format(job.scheduledStart) : "—"}</td>
                  <td>{dateFormatter.format(job.createdAt)}</td>
                  <td>
                    <div className="saas-row-actions">
                      <Link href={`/jobs/${job.id}`} className="muted">
                        View
                      </Link>
                      {canManage ? (
                        <Link href={`/jobs/${job.id}/edit`} className="muted">
                          Edit
                        </Link>
                      ) : null}
                      {canManage ? (
                        <form action={deleteJobAction}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button type="submit" className="saas-inline-action saas-inline-danger">
                            Delete
                          </button>
                        </form>
                      ) : null}
                      <Link href={`/quotes/new?clientId=${encodeURIComponent(job.clientId)}&jobId=${encodeURIComponent(job.id)}`} className="muted">
                        Send Quote
                      </Link>
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
