import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getJobDetail, listClients, updateJob } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { requireAdmin } from "@/lib/rbac";

function toDateInput(date: Date | null) {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDateTimeLocal(date: Date | null) {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

async function updateJobAction(jobId: string, formData: FormData) {
  "use server";
  await requireAdmin("/jobs?error=forbidden");

  const title = String(formData.get("title") || "").trim();
  const clientId = String(formData.get("clientId") || "").trim();
  const status = String(formData.get("status") || "draft").trim();
  const scheduledStartRaw = String(formData.get("scheduledStart") || "").trim();
  const inspectionDueDateRaw = String(formData.get("inspectionDueDate") || "").trim();

  if (!title || !clientId) {
    redirect(`/jobs/${jobId}/edit?error=invalid`);
  }

  const scheduledStart = scheduledStartRaw ? new Date(scheduledStartRaw) : null;
  const inspectionDueDate = inspectionDueDateRaw ? new Date(inspectionDueDateRaw) : null;

  await updateJob(DEV_ORG_ID, jobId, {
    title,
    clientId,
    status: status === "scheduled" || status === "completed" ? status : "draft",
    scheduledStart: scheduledStart && Number.isFinite(scheduledStart.getTime()) ? scheduledStart : null,
    inspectionDueDate: inspectionDueDate && Number.isFinite(inspectionDueDate.getTime()) ? inspectionDueDate : null,
  });

  redirect(`/jobs/${jobId}?saved=1`);
}

export const dynamic = "force-dynamic";

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/jobs?error=forbidden");
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const [job, clients] = await Promise.all([getJobDetail(DEV_ORG_ID, id), listClients(DEV_ORG_ID)]);
  if (!job) notFound();
  const error = Array.isArray(rawSearchParams.error) ? rawSearchParams.error[0] : rawSearchParams.error;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Edit Job</h1>
        <Link href={`/jobs/${job.id}`} className="button secondary">
          Back
        </Link>
      </div>

      {error === "invalid" ? <div className="banner">Title and client are required.</div> : null}

      <form action={updateJobAction.bind(null, job.id)} className="saas-form">
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" className="input" defaultValue={job.title} required />
        </div>

        <div>
          <label htmlFor="clientId">Client</label>
          <select id="clientId" name="clientId" className="input" required defaultValue={job.client.id}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={job.status}>
            <option value="draft">draft</option>
            <option value="scheduled">scheduled</option>
            <option value="completed">completed</option>
          </select>
        </div>

        <div>
          <label htmlFor="scheduledStart">Scheduled Start</label>
          <input id="scheduledStart" name="scheduledStart" className="input" type="datetime-local" defaultValue={toDateTimeLocal(job.scheduledStart || null)} />
        </div>

        <div>
          <label htmlFor="inspectionDueDate">Inspection Due Date</label>
          <input id="inspectionDueDate" name="inspectionDueDate" className="input" type="date" defaultValue={toDateInput(job.inspectionDueDate || null)} />
        </div>

        <div className="saas-form-actions">
          <button type="submit" className="button">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
