import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientDetail } from "@/lib/saas-store";
import { AppleAddressPreview } from "@/components/AppleAddressPreview";
import { DEV_ORG_ID } from "@/lib/saas";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await getClientDetail(DEV_ORG_ID, id);

  if (!client) notFound();

  const address = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.stateProvince].filter(Boolean).join(", "),
    [client.postalCode, client.country].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{client.name}</h1>
        <Link href="/clients" className="button secondary">
          Back
        </Link>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <strong>Contact</strong>
          <p className="muted">Company: {client.companyName || "—"}</p>
          <p className="muted">Email: {client.email || "—"}</p>
          <p className="muted">Phone: {client.phone || "—"}</p>
          <p className="muted">Address: {address || "—"}</p>
          <p className="muted">Created: {dateFormatter.format(client.createdAt)}</p>
        </div>

        <div className="card">
          <strong>Activity</strong>
          <p className="muted">Jobs: {client._count.jobs}</p>
          <p className="muted">Quotes: {client._count.quotes}</p>
          <p className="muted">Invoices: {client._count.invoices}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Notes</strong>
        <p className="muted">{client.notes || "No notes yet."}</p>
      </div>

      {address ? <AppleAddressPreview address={address} name={client.name} /> : null}
    </div>
  );
}
