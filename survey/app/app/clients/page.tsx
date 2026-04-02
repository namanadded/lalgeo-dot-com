import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ClientRowActions from "@/components/ClientRowActions";
import { deleteClient, listClients, mergeClients } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  _count: {
    jobs: number;
    quotes: number;
    invoices: number;
  };
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function deleteClientAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    redirect("/clients?error=forbidden");
  }
  const clientId = String(formData.get("clientId") || "").trim();
  if (!clientId) return;
  try {
    await deleteClient(DEV_ORG_ID, clientId);
  } catch {
    redirect("/clients?error=delete_failed");
  }
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  redirect("/clients?saved=deleted");
}

async function mergeClientsAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    redirect("/clients?error=forbidden");
  }
  const keepClientId = String(formData.get("keepClientId") || "").trim();
  const removeClientId = String(formData.get("removeClientId") || "").trim();
  if (!keepClientId || !removeClientId) {
    redirect("/clients?error=merge_missing");
  }
  if (keepClientId === removeClientId) {
    redirect("/clients?error=merge_same");
  }

  try {
    await mergeClients(DEV_ORG_ID, keepClientId, removeClientId);
  } catch {
    redirect("/clients?error=merge_failed");
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${keepClientId}`);
  revalidatePath(`/clients/${removeClientId}`);
  revalidatePath("/jobs");
  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/clients?saved=merged&keep=${encodeURIComponent(keepClientId)}`);
}

export default async function AppClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = getParam(params.q).trim().toLowerCase();
  const saved = getParam(params.saved);
  const error = getParam(params.error);
  const session = await getSessionUser();
  const canManage = session?.role === "admin";

  const allClients = (await listClients(DEV_ORG_ID)) as ClientRow[];
  const clients = allClients.filter((client) => {
    if (!query) return true;
    const haystack = [client.name, client.companyName, client.email, client.phone].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Clients</h1>
        <Link href="/clients/new" className="button">
          New Client
        </Link>
      </div>

      {saved === "deleted" ? <div className="banner">Client deleted.</div> : null}
      {saved === "merged" ? <div className="banner">Clients merged successfully.</div> : null}
      {error === "delete_failed" ? <div className="banner">Cannot delete this client yet. Remove related jobs/quotes/invoices first.</div> : null}
      {error === "merge_missing" ? <div className="banner">Choose both the client to keep and the client to remove.</div> : null}
      {error === "merge_same" ? <div className="banner">Choose two different clients to merge.</div> : null}
      {error === "merge_failed" ? <div className="banner">Client merge failed. Check for duplicate selection and try again.</div> : null}
      {error === "forbidden" ? <div className="banner">Only admins can edit or delete records.</div> : null}

      <form className="saas-toolbar" method="get">
        <input className="input" name="q" defaultValue={getParam(params.q)} placeholder="Search name, email, phone" />
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {allClients.length === 0 ? (
        <div className="saas-empty-state saas-empty-state-cta">
          <div className="saas-empty-title">No clients yet.</div>
          <div>Add your first client to start managing jobs, quotes, and invoices.</div>
          <div className="saas-empty-actions">
            <Link href="/clients/new" className="button">
              Add First Client
            </Link>
          </div>
        </div>
      ) : clients.length === 0 ? (
        <div className="saas-empty-state">
          <div>No matching clients.</div>
          <div>Try a different search term.</div>
        </div>
      ) : (
        <div className="saas-table-wrap">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Jobs</th>
                <th>Quotes</th>
                <th>Invoices</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>{client.companyName || "—"}</td>
                  <td>{client.email || "—"}</td>
                  <td>{client.phone || "—"}</td>
                  <td>{client._count.jobs}</td>
                  <td>{client._count.quotes}</td>
                  <td>{client._count.invoices}</td>
                  <td>{dateFormatter.format(client.createdAt)}</td>
                  <td>
                    <div className="saas-row-actions">
                      <Link href={`/clients/${client.id}`} className="muted">
                        View
                      </Link>
                      {canManage ? (
                        <Link href={`/clients/${client.id}/edit`} className="muted">
                          Edit
                        </Link>
                      ) : null}
                      {canManage ? (
                        <ClientRowActions
                          client={client}
                          allClients={allClients}
                          deleteAction={deleteClientAction}
                          mergeAction={mergeClientsAction}
                        />
                      ) : null}
                      <Link href={`/jobs/new?clientId=${encodeURIComponent(client.id)}`} className="muted">
                        Create Job
                      </Link>
                      <Link href={`/quotes/new?clientId=${encodeURIComponent(client.id)}`} className="muted">
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
