import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assetConditionClass, assetStatusClass, assetStatusLabel } from "@/lib/assets";
import { deleteAsset, getAssetSummary, listAssets } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  assetId: string;
  name: string;
  type: string | null;
  status: string;
  condition: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  updatedAt: Date;
  _count: { activities: number };
};

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function deleteAssetAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    redirect("/assets?error=forbidden");
  }
  const assetId = String(formData.get("assetId") || "").trim();
  if (!assetId) return;
  try {
    await deleteAsset(DEV_ORG_ID, assetId);
  } catch {
    redirect("/assets?error=delete_failed");
  }
  revalidatePath("/assets");
  revalidatePath("/dashboard");
  redirect("/assets?saved=deleted");
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = getParam(params.q).trim().toLowerCase();
  const statusFilter = getParam(params.status).trim().toLowerCase();
  const conditionFilter = getParam(params.condition).trim().toLowerCase();
  const saved = getParam(params.saved);
  const error = getParam(params.error);
  const session = await getSessionUser();
  const canManage = session?.role === "admin";

  const [allAssets, summary] = await Promise.all([listAssets(DEV_ORG_ID), getAssetSummary(DEV_ORG_ID)]);
  const assets = (allAssets as AssetRow[]).filter((asset) => {
    if (statusFilter && statusFilter !== "all" && asset.status.toLowerCase() !== statusFilter) return false;
    if (conditionFilter && conditionFilter !== "all" && (asset.condition || "").toLowerCase() !== conditionFilter) return false;
    if (!query) return true;
    const haystack = [asset.assetId, asset.name, asset.type, asset.status, asset.condition, asset.address].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>Assets</h1>
        <Link href="/assets/new" className="button">
          New Asset
        </Link>
      </div>

      {saved === "created" ? <div className="banner">Asset created.</div> : null}
      {saved === "deleted" ? <div className="banner">Asset deleted.</div> : null}
      {error === "delete_failed" ? <div className="banner">Could not delete this asset.</div> : null}
      {error === "forbidden" ? <div className="banner">Only admins can edit or delete records.</div> : null}

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Total Assets</div>
          <div className="dashboard-kpi-value">{summary.total}</div>
          <div className="muted">Live records in this workspace</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Active</div>
          <div className="dashboard-kpi-value">{summary.active}</div>
          <div className="muted">Available for field work</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Needs Attention</div>
          <div className="dashboard-kpi-value">{summary.needsAttention}</div>
          <div className="muted">Marked for follow-up</div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Inactive</div>
          <div className="dashboard-kpi-value">{summary.inactive}</div>
          <div className="muted">Inactive or retired assets</div>
        </div>
      </div>

      <form className="saas-toolbar saas-toolbar-grid" method="get">
        <input className="input" name="q" defaultValue={getParam(params.q)} placeholder="Search asset ID, name, type, address" />
        <select className="input" name="status" defaultValue={statusFilter || "all"}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="needs_attention">Needs attention</option>
          <option value="inactive">Inactive</option>
          <option value="retired">Retired</option>
        </select>
        <select className="input" name="condition" defaultValue={conditionFilter || "all"}>
          <option value="all">All conditions</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="critical">Critical</option>
          <option value="unknown">Unknown</option>
        </select>
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {allAssets.length === 0 ? (
        <div className="saas-empty-state saas-empty-state-cta">
          <div className="saas-empty-title">No assets yet.</div>
          <div>Create your first asset record, then connect imports, inspections, photos, and work orders around it.</div>
          <div className="saas-empty-actions">
            <Link href="/assets/new" className="button">
              Create First Asset
            </Link>
          </div>
        </div>
      ) : assets.length === 0 ? (
        <div className="saas-empty-state">
          <div>No matching assets.</div>
          <div>Adjust your filters to see more records.</div>
        </div>
      ) : (
        <div className="saas-table-wrap">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Location</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.assetId}</td>
                  <td>{asset.name}</td>
                  <td>{asset.type || "—"}</td>
                  <td>
                    <span className={assetStatusClass(asset.status)}>{assetStatusLabel(asset.status)}</span>
                  </td>
                  <td>
                    <span className={assetConditionClass(asset.condition)}>{asset.condition || "unknown"}</span>
                  </td>
                  <td>{asset.address || (asset.latitude && asset.longitude ? `${asset.latitude}, ${asset.longitude}` : "—")}</td>
                  <td>{dateFormatter.format(asset.updatedAt)}</td>
                  <td>
                    <div className="saas-row-actions">
                      <Link href={`/assets/${asset.id}`} className="muted">
                        View
                      </Link>
                      {canManage ? (
                        <Link href={`/assets/${asset.id}/edit`} className="muted">
                          Edit
                        </Link>
                      ) : null}
                      {canManage ? (
                        <form action={deleteAssetAction}>
                          <input type="hidden" name="assetId" value={asset.id} />
                          <button type="submit" className="saas-inline-action saas-inline-danger">
                            Delete
                          </button>
                        </form>
                      ) : null}
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
