import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { runSyncJob } from "@/lib/sync-worker";

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const connectionId = String(body.connectionId || "");
  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId." }, { status: 400 });
  }
  try {
    const result = await runSyncJob({
      connectionId,
      triggeredBy: "manual",
      dryRun: Boolean(body.dryRun),
      reason: body.reason ? String(body.reason) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
