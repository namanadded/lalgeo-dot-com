import { searchCalgary } from "../../../../lib/public-data";
import { failure, json, options } from "../../../../lib/map-http";
import { rateLimit } from "../../../../lib/map-store";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(request: Request) {
  try {
    await rateLimit(request, "search", 60);
    return json({ datasets: await searchCalgary(new URL(request.url).searchParams.get("q") || "") });
  } catch (error) { return failure(error); }
}
