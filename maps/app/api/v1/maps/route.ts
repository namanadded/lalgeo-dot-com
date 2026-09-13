import { createMap } from "../../../../lib/map-schema";
import { rateLimit, saveMap } from "../../../../lib/map-store";
import { failure, json, options, readJson } from "../../../../lib/map-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST(request: Request) {
  try {
    await rateLimit(request);
    const map = await createMap(await readJson(request));
    const { id, deleteToken } = await saveMap(map);
    const origin = process.env.NODE_ENV === "production" ? "https://maps.lalgeo.com" : new URL(request.url).origin;
    const shareUrl = `${origin}/s/${id}`;
    return json({ id, shareUrl, apiUrl: `${origin}/api/v1/maps/${id}`, deleteToken,
      title: map.title, featureCount: map.featureCount, createdAt: map.createdAt,
      notice: "Anyone with this link can view the saved snapshot. Keep deleteToken private to revoke it." }, 201, { Location: shareUrl });
  } catch (error) { return failure(error); }
}
