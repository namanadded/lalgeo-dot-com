import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DEV_ORG_ID, ensureDevOrganization } from "@/lib/saas";

async function createJob(formData: FormData) {
  "use server";

  const title = String(formData.get("title") || "").trim();
  const clientId = String(formData.get("clientId") || "").trim();
  const rawStatus = String(formData.get("status") || "draft").trim();
  const status = rawStatus === "scheduled" || rawStatus === "completed" ? rawStatus : "draft";

  if (!title || !clientId) return;

  await ensureDevOrganization();
  await prisma.job.create({
    data: {
      organizationId: DEV_ORG_ID,
      title,
      clientId,
      status,
    },
  });

  redirect("/app/jobs");
}

export default async function NewJobPage() {
  const clients = await prisma.client.findMany({
    where: { organizationId: DEV_ORG_ID },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>New Job</h1>
        <Link href="/app/jobs" className="button secondary">
          Back
        </Link>
      </div>

      <form action={createJob} className="saas-form">
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" className="input" required />
        </div>

        <div>
          <label htmlFor="clientId">Client</label>
          <select id="clientId" name="clientId" className="input" required defaultValue="">
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue="draft">
            <option value="draft">draft</option>
            <option value="scheduled">scheduled</option>
            <option value="completed">completed</option>
          </select>
        </div>

        <div className="saas-form-actions">
          <button type="submit" className="button" disabled={clients.length === 0}>
            Create Job
          </button>
        </div>
      </form>
    </div>
  );
}
