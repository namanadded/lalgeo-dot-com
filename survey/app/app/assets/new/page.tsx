import Link from "next/link";
import { redirect } from "next/navigation";
import { ASSET_CONDITIONS, ASSET_STATUSES, normalizeAttributesJson, optionalNumber } from "@/lib/assets";
import { createAsset as createAssetRecord } from "@/lib/saas-store";
import { DEV_ORG_ID, ensureDevOrganization } from "@/lib/saas";
import { requireAdmin } from "@/lib/rbac";

async function createAsset(formData: FormData) {
  "use server";
  await requireAdmin("/assets?error=forbidden");

  const assetId = String(formData.get("assetId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!assetId || !name) {
    redirect("/assets/new?error=missing_required");
  }

  let attributesJson: string | null = null;
  try {
    attributesJson = normalizeAttributesJson(formData.get("attributesJson"));
  } catch {
    redirect("/assets/new?error=invalid_json");
  }

  await ensureDevOrganization();
  try {
    await createAssetRecord({
      organizationId: DEV_ORG_ID,
      assetId,
      name,
      type: String(formData.get("type") || "").trim() || null,
      status: String(formData.get("status") || "active").trim() || "active",
      condition: String(formData.get("condition") || "").trim() || null,
      address: String(formData.get("address") || "").trim() || null,
      latitude: optionalNumber(formData.get("latitude")),
      longitude: optionalNumber(formData.get("longitude")),
      notes: String(formData.get("notes") || "").trim() || null,
      attributesJson,
    });
  } catch {
    redirect("/assets/new?error=create_failed");
  }

  redirect("/assets?saved=created");
}

function getError(searchParams?: Record<string, string | string[] | undefined>) {
  const error = searchParams?.error;
  return Array.isArray(error) ? error[0] : error;
}

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/assets?error=forbidden");
  const error = getError(searchParams ? await searchParams : undefined);

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>New Asset</h1>
        <Link href="/assets" className="button secondary">
          Back
        </Link>
      </div>

      {error === "missing_required" ? <div className="banner">Asset ID and name are required.</div> : null}
      {error === "invalid_json" ? <div className="banner">Attributes must be valid JSON.</div> : null}
      {error === "create_failed" ? <div className="banner">Could not create this asset. Check for a duplicate asset ID.</div> : null}

      <form action={createAsset} className="saas-form">
        <div>
          <label htmlFor="assetId">Asset ID</label>
          <input id="assetId" name="assetId" className="input" placeholder="HYD-1001" required />
        </div>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" className="input" placeholder="Hydrant 1001" required />
        </div>
        <div>
          <label htmlFor="type">Asset Type</label>
          <input id="type" name="type" className="input" placeholder="Hydrant, sign, valve, tree" />
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue="active">
            {ASSET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="condition">Condition</label>
          <select id="condition" name="condition" className="input" defaultValue="unknown">
            {ASSET_CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="address">Address or Location Notes</label>
          <input id="address" name="address" className="input" placeholder="Near north gate" />
        </div>
        <div className="grid grid-2">
          <div>
            <label htmlFor="latitude">Latitude</label>
            <input id="latitude" name="latitude" className="input" inputMode="decimal" placeholder="49.2827" />
          </div>
          <div>
            <label htmlFor="longitude">Longitude</label>
            <input id="longitude" name="longitude" className="input" inputMode="decimal" placeholder="-123.1207" />
          </div>
        </div>
        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input" rows={3} />
        </div>
        <div>
          <label htmlFor="attributesJson">Attributes JSON</label>
          <textarea id="attributesJson" name="attributesJson" className="input" rows={5} placeholder='{"diameter":"150 mm","material":"steel"}' />
        </div>
        <div className="saas-form-actions">
          <button type="submit" className="button">
            Create Asset
          </button>
        </div>
      </form>
    </div>
  );
}
