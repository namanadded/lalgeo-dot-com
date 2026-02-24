import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listSyncLogs, listSyncRuns } from "@/lib/sync";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get("connectionId") || "";
  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId." }, { status: 400 });
  }
  return NextResponse.json({
    logs: listSyncLogs(connectionId).slice(0, 200),
    runs: listSyncRuns(connectionId).slice(0, 20),
  });
}
