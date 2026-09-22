import { readMap, deleteMap } from "../../../../../lib/map-store";
import { failure, json, options } from "../../../../../lib/map-http";
import { MapError } from "../../../../../lib/public-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const saved = await readMap((await context.params).id);
    if (!saved) throw new MapError("Map not found or no longer shared.", 404);
    return json(saved.map);
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) throw new MapError("A Bearer deletion token is required.", 401);
    await deleteMap((await context.params).id, token);
    return json({ deleted: true });
  } catch (error) { return failure(error); }
}
