import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export class MapError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const MAX_BYTES = 3 * 1024 * 1024;

export function publicUrl(input: unknown): URL {
  if (typeof input !== "string" || input.length > 2048) throw new MapError("Provide a public HTTPS data URL.");
  let url: URL;
  try { url = new URL(input); } catch { throw new MapError("Invalid data URL."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      isIP(url.hostname.replace(/^\[|\]$/g, "")) || !url.hostname.includes(".") ||
      /\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)) {
    throw new MapError("Use a public HTTPS hostname without credentials or a custom port.");
  }
  for (const key of url.searchParams.keys()) {
    if (/token|secret|password|api.?key|signature|credential|authorization/i.test(key)) {
      throw new MapError("Source URLs must not contain credentials; shared maps are public to anyone with the link.");
    }
  }
  url.hash = "";
  return url;
}

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

// Pin the validated DNS result to this TLS connection, including every redirect.
// No cookies, authorization headers, or caller-supplied headers are forwarded.
export async function fetchPublicJson(input: string, redirects = 0): Promise<any> {
  const url = publicUrl(input);
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new MapError("DNS lookup timed out.", 504)), 5000); timer.unref(); })
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new MapError("The source must resolve only to public internet addresses.");
  }
  const result = await new Promise<{ location?: string; body?: string }>((resolve, reject) => {
    const req = request(url, {
      agent: false,
      headers: { Accept: "application/geo+json, application/json", "User-Agent": "LalGeo-Maps/1.0" },
      lookup: (_hostname, options, callback) => {
        if ((options as { all?: boolean }).all) callback(null, addresses as any);
        else callback(null, addresses[0].address, addresses[0].family);
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        res.resume(); resolve({ location: new URL(res.headers.location, url).href }); return;
      }
      if (res.statusCode !== 200) {
        res.resume(); reject(new MapError(`Data source returned HTTP ${res.statusCode}.`, 422)); return;
      }
      if (Number(res.headers["content-length"] || 0) > MAX_BYTES) {
        res.destroy(); reject(new MapError("Data source exceeds the 3 MB sharing limit.", 413)); return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { req.destroy(new MapError("Data source exceeds the 3 MB sharing limit.", 413)); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new MapError("Data source timed out.", 504)), 12000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
  if (result.location) {
    if (redirects >= 3) throw new MapError("Too many data-source redirects.", 422);
    return fetchPublicJson(result.location, redirects + 1);
  }
  try { return JSON.parse(result.body!); } catch { throw new MapError("The URL did not return JSON. Use a GeoJSON endpoint or a Calgary dataset link.", 422); }
}

export async function searchCalgary(query: string, fetchJson = fetchPublicJson) {
  if (!query.trim() || query.length > 160) throw new MapError("Provide a dataset search query (1–160 characters).");
  const url = new URL("https://api.us.socrata.com/api/catalog/v1");
  url.searchParams.set("search_context", "data.calgary.ca");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "12");
  const data = await fetchJson(url.href);
  return (data.results || []).map((item: any) => ({
    id: item.resource?.id, name: item.resource?.name, description: item.resource?.description,
    sourceUrl: item.permalink, dataId: item.resource?.parent_fxf?.[0] || item.resource?.id,
    type: item.resource?.type, updatedAt: item.resource?.data_updated_at,
  }));
}

export async function resolveSource(input: string, fetchJson = fetchPublicJson) {
  const url = publicUrl(input);
  if (url.hostname !== "data.calgary.ca") return { url: url.href, title: "Open data layer" };
  const id = Array.from(url.pathname.matchAll(/(?:^|\/)([a-z0-9]{4}-[a-z0-9]{4})(?:\.(?:json|geojson))?(?=\/|$)/gi)).at(-1)?.[1];
  if (!id) throw new MapError("Choose a Calgary dataset first: GET /api/v1/datasets?q=community%20boundaries. The portal homepage is not a dataset.", 422);
  const metadata = await fetchJson(`https://data.calgary.ca/api/views/${id}.json`);
  let dataId = id;
  if (!metadata.columns?.length) {
    const matches = await searchCalgary(metadata.name || id, fetchJson);
    const match = matches.find((item: any) => item.id === id);
    if (!match?.dataId || match.dataId === id) throw new MapError("This Calgary view has no spatial dataset. Choose a dataset from the search endpoint.", 422);
    dataId = match.dataId;
  }
  const endpoint = new URL(`https://data.calgary.ca/resource/${dataId}.geojson`);
  if (url.pathname.startsWith("/resource/")) endpoint.search = url.search;
  // Request one extra record so large datasets fail explicitly, never silently truncate.
  if (!endpoint.searchParams.has("$limit")) endpoint.searchParams.set("$limit", "10001");
  return { url: endpoint.href, title: metadata.name || "Calgary open data" };
}
