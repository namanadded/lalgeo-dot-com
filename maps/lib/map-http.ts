import { MapError, MAX_BYTES } from "./public-data";

export const headers = { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
export function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { ...headers, ...extra } });
}
export function failure(error: unknown) {
  if (error instanceof MapError) return json({ error: error.message }, error.status, error.status === 429 ? { "Retry-After": "3600" } : {});
  console.error("Map API failure", error instanceof Error ? error.name : "Unknown error");
  return json({ error: "Map service is temporarily unavailable. Please retry." }, 503);
}
export function options() {
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new MapError("Send Content-Type: application/json.", 415);
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) throw new MapError("Request exceeds 3 MB.", 413);
  if (!request.body) throw new MapError("JSON request body required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new MapError("Request exceeds 3 MB.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new MapError("Invalid JSON request body."); }
}
