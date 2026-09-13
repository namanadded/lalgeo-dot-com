import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { MapError } from "./public-data";
import type { SharedMap } from "./map-schema";

type StoredMap = { map: SharedMap; deleteHash: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const validMapId = (id: string) => /^[a-f0-9]{32}$/.test(id);
// Local disk is development-only. Production must have durable Netlify storage.
const localDir = () => process.env.NODE_ENV !== "production" && !process.env.NETLIFY ? path.join(process.cwd(), ".local-shared-maps") : null;
const store = () => getStore({ name: "lalgeo-shared-maps-v1", consistency: "strong" });

export async function readMap(id: string): Promise<StoredMap | null> {
  if (!validMapId(id)) return null;
  const dir = localDir();
  if (dir) {
    try { return JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")); }
    catch (error: any) { if (error.code === "ENOENT") return null; throw error; }
  }
  return store().get(id, { type: "json" });
}

export async function saveMap(map: SharedMap) {
  const id = randomBytes(16).toString("hex"), deleteToken = randomBytes(32).toString("hex");
  const value = { map, deleteHash: hash(deleteToken) };
  const dir = localDir();
  if (dir) { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, `${id}.json`), JSON.stringify(value), { flag: "wx" }); }
  else if (!(await store().setJSON(id, value, { onlyIfNew: true })).modified) throw new Error("Map ID collision; retry sharing.");
  return { id, deleteToken };
}

export async function deleteMap(id: string, token: string) {
  const saved = await readMap(id);
  if (!saved) throw new MapError("Map not found or no longer shared.", 404);
  if (!timingSafeEqual(Buffer.from(hash(token)), Buffer.from(saved.deleteHash))) throw new MapError("Invalid deletion token.", 403);
  const dir = localDir();
  if (dir) await unlink(path.join(dir, `${id}.json`));
  else await store().delete(id);
}

const localLimits = new Map<string, { count: number; reset: number }>();
export async function rateLimit(request: Request, category = "create", limit = 20) {
  // Netlify overwrites this header with the connecting IP. Never trust forwarded-for.
  const ip = request.headers.get("x-nf-client-connection-ip") || (process.env.NODE_ENV !== "production" ? "local" : "unknown");
  const key = `${category}-${hash(ip)}`;
  const now = Date.now();
  const increment = (old: { count: number; reset: number } | null) => {
    const value = old && old.reset > now ? old : { count: 0, reset: now + 3600000 };
    if (value.count >= limit) throw new MapError("Hourly request limit reached. Please try again later.", 429);
    return { count: value.count + 1, reset: value.reset };
  };
  if (localDir()) { localLimits.set(key, increment(localLimits.get(key) || null)); return; }
  const limits = getStore({ name: "lalgeo-map-rate-limits-v1", consistency: "strong" });
  for (let attempt = 0; attempt < 5; attempt++) {
    const old = await limits.getWithMetadata(key, { type: "json" });
    const next = increment(old?.data || null);
    const result = await limits.setJSON(key, next, old ? { onlyIfMatch: old.etag } : { onlyIfNew: true });
    if (result.modified) return;
  }
  throw new MapError("Too many concurrent requests. Please retry.", 429);
}
