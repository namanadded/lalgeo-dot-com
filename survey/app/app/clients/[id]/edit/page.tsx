import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClientDetail, updateClient } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { requireAdmin } from "@/lib/rbac";

async function updateClientAction(clientId: string, formData: FormData) {
  "use server";
  await requireAdmin("/clients?error=forbidden");

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    redirect(`/clients/${clientId}/edit?error=missing_name`);
  }

  await updateClient(DEV_ORG_ID, clientId, {
    name,
    companyName: String(formData.get("companyName") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    addressLine1: String(formData.get("addressLine1") || "").trim() || null,
    addressLine2: String(formData.get("addressLine2") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    stateProvince: String(formData.get("stateProvince") || "").trim() || null,
    postalCode: String(formData.get("postalCode") || "").trim() || null,
    country: String(formData.get("country") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });
  redirect(`/clients/${clientId}?saved=1`);
}

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/clients?error=forbidden");
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const client = await getClientDetail(DEV_ORG_ID, id);
  if (!client) notFound();

  const error = Array.isArray(rawSearchParams.error) ? rawSearchParams.error[0] : rawSearchParams.error;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Edit Client</h1>
        <div className="saas-row-actions">
          <Link href={`/clients/${client.id}`} className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {error === "missing_name" ? <div className="banner">Name is required.</div> : null}

      <form action={updateClientAction.bind(null, client.id)} className="saas-form">
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" className="input" defaultValue={client.name} required />
        </div>
        <div>
          <label htmlFor="companyName">Company</label>
          <input id="companyName" name="companyName" className="input" defaultValue={client.companyName || ""} />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" defaultValue={client.email || ""} />
        </div>
        <div>
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="input" defaultValue={client.phone || ""} />
        </div>
        <div>
          <label htmlFor="addressLine1">Address Line 1</label>
          <input id="addressLine1" name="addressLine1" className="input" defaultValue={client.addressLine1 || ""} />
        </div>
        <div>
          <label htmlFor="addressLine2">Address Line 2</label>
          <input id="addressLine2" name="addressLine2" className="input" defaultValue={client.addressLine2 || ""} />
        </div>
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" className="input" defaultValue={client.city || ""} />
        </div>
        <div>
          <label htmlFor="stateProvince">Province/State</label>
          <input id="stateProvince" name="stateProvince" className="input" defaultValue={client.stateProvince || ""} />
        </div>
        <div>
          <label htmlFor="postalCode">Postal/ZIP</label>
          <input id="postalCode" name="postalCode" className="input" defaultValue={client.postalCode || ""} />
        </div>
        <div>
          <label htmlFor="country">Country</label>
          <input id="country" name="country" className="input" defaultValue={client.country || ""} />
        </div>
        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input" rows={4} defaultValue={client.notes || ""} />
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
