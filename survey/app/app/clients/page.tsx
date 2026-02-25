import Link from "next/link";
import { listClients } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function AppClientsPage() {
  const clients = (await listClients(DEV_ORG_ID)) as ClientRow[];

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Clients</h1>
        <Link href="/app/clients/new" className="button">
          New Client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="saas-empty-state">
          <div>No clients yet.</div>
          <div>Create your first client to get started.</div>
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
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>{client.companyName || "—"}</td>
                  <td>{client.email || "—"}</td>
                  <td>{client.phone || "—"}</td>
                  <td>{dateFormatter.format(client.createdAt)}</td>
                  <td>
                    <Link href={`/app/clients/${client.id}`} className="muted">
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
