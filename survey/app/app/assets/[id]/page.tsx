import Link from "next/link";
import { notFound } from "next/navigation";
import { assetConditionClass, assetStatusClass, assetStatusLabel } from "@/lib/assets";
import { getAssetDetail } from "@/lib/saas-store";
import { DEV_ORG_ID } from "@/lib/saas";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatAttributes(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }> | { saved?: string };
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams ? searchParams : Promise.resolve(undefined)]);
  const [asset, session] = await Promise.all([getAssetDetail(DEV_ORG_ID, id), getSessionUser()]);
  if (!asset) notFound();

  const saved = typeof resolvedSearchParams === "object" ? resolvedSearchParams?.saved : undefined;
  const hasCoordinates = asset.latitude !== null && asset.longitude !== null;
  const attributes = formatAttributes(asset.attributesJson);
  const mapHref = hasCoordinates ? `https://maps.google.com/?q=${asset.latitude},${asset.longitude}` : null;

  return (
    <div className="saas-page-card">
      <div className="saas-page-header">
        <h1>{asset.name}</h1>
        <div className="saas-row-actions">
          {session?.role === "admin" ? (
            <Link href={`/assets/${asset.id}/edit`} className="button secondary">
              Edit Asset
            </Link>
          ) : null}
          <Link href="/assets" className="button secondary">
            Back
          </Link>
        </div>
      </div>

      {saved === "1" ? <div className="banner">Asset updated.</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <strong>Asset Record</strong>
          <p className="muted">Asset ID: {asset.assetId}</p>
          <p className="muted">Type: {asset.type || "—"}</p>
          <p className="muted">
            Status: <span className={assetStatusClass(asset.status)}>{assetStatusLabel(asset.status)}</span>
          </p>
          <p className="muted">
            Condition: <span className={assetConditionClass(asset.condition)}>{asset.condition || "unknown"}</span>
          </p>
          <p className="muted">Created: {dateFormatter.format(asset.createdAt)}</p>
          <p className="muted">Updated: {dateFormatter.format(asset.updatedAt)}</p>
        </div>

        <div className="card">
          <strong>Location</strong>
          <p className="muted">Address: {asset.address || "—"}</p>
          <p className="muted">Latitude: {asset.latitude ?? "—"}</p>
          <p className="muted">Longitude: {asset.longitude ?? "—"}</p>
          {mapHref ? (
            <p>
              <a className="muted" href={mapHref} target="_blank" rel="noopener">
                Open location in map
              </a>
            </p>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Notes</strong>
        <p className="muted">{asset.notes || "No notes yet."}</p>
      </div>

      <div className="dashboard-section-grid" style={{ marginTop: 16 }}>
        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Attributes</div>
          {attributes ? (
            <pre className="muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {attributes}
            </pre>
          ) : (
            <div className="saas-empty-state">
              <div>No custom attributes yet.</div>
              <div>Imported GIS fields will appear here as structured asset data.</div>
            </div>
          )}
        </section>

        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Activity</div>
          {!asset.activities.length ? (
            <div className="saas-empty-state">
              <div>No activity yet.</div>
              <div>Inspections, photos, and work orders will build this history over time.</div>
            </div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{dateTimeFormatter.format(activity.createdAt)}</td>
                      <td>{activity.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-section-grid" style={{ marginTop: 16 }}>
        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Inspections</div>
          <div className="saas-empty-state">
            <div>Inspection records are next.</div>
            <div>They should connect forms, notes, photos, and condition updates to this asset.</div>
          </div>
        </section>
        <section className="dashboard-section-card">
          <div className="dashboard-section-title">Work Orders</div>
          <div className="saas-empty-state">
            <div>Asset-linked work orders are next.</div>
            <div>They should track priority, status, due date, assignment, and completion notes.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
