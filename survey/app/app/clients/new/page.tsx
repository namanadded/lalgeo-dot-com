import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AppleAddressMapField } from "@/components/AppleAddressMapField";
import { DEV_ORG_ID, ensureDevOrganization } from "@/lib/saas";

async function createClient(formData: FormData) {
  "use server";

  const name = String(formData.get("name") || "").trim();
  const emailRaw = String(formData.get("email") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const companyNameRaw = String(formData.get("companyName") || "").trim();
  const addressLine1Raw = String(formData.get("addressLine1") || "").trim();
  const addressLine2Raw = String(formData.get("addressLine2") || "").trim();
  const cityRaw = String(formData.get("city") || "").trim();
  const stateProvinceRaw = String(formData.get("stateProvince") || "").trim();
  const postalCodeRaw = String(formData.get("postalCode") || "").trim();
  const countryRaw = String(formData.get("country") || "").trim();
  const notesRaw = String(formData.get("notes") || "").trim();

  if (!name) return;

  await ensureDevOrganization();
  await prisma.client.create({
    data: {
      organizationId: DEV_ORG_ID,
      name,
      companyName: companyNameRaw || null,
      email: emailRaw || null,
      phone: phoneRaw || null,
      addressLine1: addressLine1Raw || null,
      addressLine2: addressLine2Raw || null,
      city: cityRaw || null,
      stateProvince: stateProvinceRaw || null,
      postalCode: postalCodeRaw || null,
      country: countryRaw || null,
      notes: notesRaw || null,
    },
  });

  redirect("/app/clients");
}

export default function NewClientPage() {
  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>New Client</h1>
        <Link href="/app/clients" className="button secondary">
          Back
        </Link>
      </div>

      <form action={createClient} className="saas-form">
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" className="input" required />
        </div>
        <div>
          <label htmlFor="companyName">Company (optional)</label>
          <input id="companyName" name="companyName" className="input" />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" />
        </div>
        <div>
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="input" />
        </div>
        <AppleAddressMapField />
        <div>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="input" rows={3} />
        </div>
        <div className="saas-form-actions">
          <button type="submit" className="button">
            Create Client
          </button>
        </div>
      </form>
    </div>
  );
}
