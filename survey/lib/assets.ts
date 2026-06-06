export const ASSET_STATUSES = ["active", "needs_attention", "inactive", "retired"] as const;
export const ASSET_CONDITIONS = ["good", "fair", "poor", "critical", "unknown"] as const;

export function assetStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function assetStatusClass(status: string) {
  if (status === "active") return "status-pill success";
  if (status === "needs_attention") return "status-pill warn";
  if (status === "retired" || status === "inactive") return "status-pill";
  return "status-pill";
}

export function assetConditionClass(condition?: string | null) {
  if (condition === "good") return "status-pill success";
  if (condition === "fair" || condition === "unknown") return "status-pill warn";
  if (condition === "poor" || condition === "critical") return "status-pill error";
  return "status-pill";
}

export function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAttributesJson(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  JSON.parse(raw);
  return raw;
}
