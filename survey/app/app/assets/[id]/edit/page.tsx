import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ASSET_CONDITIONS, ASSET_STATUSES, normalizeAttributesJson, optionalNumber } from "@/lib/assets";
import { getAssetDetail, updateAsset } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { requireAdmin } from "@/lib/rbac";

async function updateAssetAction(assetRecordId: string, formData: FormData) {
  "use server";
  await requireAdmin("/assets?error=forbidden");

  const assetId = String(formData.get("assetId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!assetId || !name) {
    redirect(`/assets/${assetRecordId}/edit?error=missing_required`);
  }

  let attributesJson: string | null = null;
  try {
    attributesJson = normalizeAttributesJson(formData.get("attributesJson"));
  } catch {
    redirect(`/assets/${assetRecordId}/edit?error=invalid_json`);
  }

  try {
    await updateAsset(DEV_ORG_ID, assetRecordId, {
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
    redirect(`/assets/${assetRecordId}/edit?error=save_failed`);
  }

  redirect(`/assets/${assetRecordId}?saved=1`);
}

function getError(searchParams: Record<string, string | string[] | undefined>) {
  const error = searchParams.error;
  return Array.isArray(error) ? error[0] : error;
}

export const dynamic = "force-dynamic";

export default async function EditAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/assets?error=forbidden");
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const asset = await getAssetDetail(DEV_ORG_ID, id);
  if (!asset) notFound();
  const error = getError(rawSearchParams);

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Edit Asset</h1>
        <div className="saas-row-actions">
          <Link href={`/assets/${asset.id}`} className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {error === "missing_required" ? <div className="banner">Asset ID and name are required.</div> : null}
      {error === "invalid_json" ? <div className="banner">Attributes must be valid JSON.</div> : null}
      {error === "save_failed" ? <div className="banner">Could not save this asset. Check for a duplicate asset ID.</div> : null}

      <form action={updateAssetAction.bind(null, asset.id)} className="saas-form">
        <div>
          <label htmlFor="assetId">Asset ID</label>
          <input id="assetId" name="assetId" className="input" defaultValue={asset.assetId} required />
        </div>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" className="input" defaultValue={asset.name} required />
        </div>
        <div>
          <label htmlFor="type">Asset Type</label>
          <input id="type" name="type" className="input" defaultValue={asset.type || ""} />
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={asset.status}>
            {ASSET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="condition">Condition</label>
          <select id="condition" name="condition" className="input" defaultValue={asset.condition || "unknown"}>
            {ASSET_CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="address">Address or Location Notes</label>
          <input id="address" name="address" className="input" defaultValue={asset.address || ""} />
        </div>
        <div className="grid grid-2">
          <div>
            <label htmlFor="latitude">Latitude</label>
            <input id="latitude" name="latitude" className="input" inputMode="decimal" defaultValue={asset.latitude ?? ""} />
          </div>
          <div>
            <label htmlFor="longitude">Longitude</label>
            <input id="longitude" name="longitude" className="input" inputMode="decimal" defaultValue={asset.longitude ?? ""} />
          </div>
        </div>
        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="input" rows={3} defaultValue={asset.notes || ""} />
        </div>
        <div>
          <label htmlFor="attributesJson">Attributes JSON</label>
          <textarea id="attributesJson" name="attributesJson" className="input" rows={5} defaultValue={asset.attributesJson || ""} />
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
