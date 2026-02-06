import { NextResponse } from "next/server";
import { runWebhookSyncs } from "@/lib/sync-worker";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const reason = payload?.reason ? String(payload.reason) : "Dropbox webhook";
  const results = await runWebhookSyncs(reason);
  return NextResponse.json({ ok: true, runs: results });
}
