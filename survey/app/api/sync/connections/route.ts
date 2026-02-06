import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createSyncConnection,
  listSyncConnections,
  validateSyncConnection,
  type SyncConnectionDraft,
} from "@/lib/sync";

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ connections: listSyncConnections() });
}

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const draft = body.connection as SyncConnectionDraft | undefined;
  if (!draft) {
    return NextResponse.json({ error: "Missing connection payload." }, { status: 400 });
  }

  const validation = validateSyncConnection(draft);
  if (body.validateOnly) {
    return NextResponse.json({ validation });
  }

  if (!validation.ok) {
    return NextResponse.json({ error: "Validation failed.", validation }, { status: 400 });
  }

  const connection = createSyncConnection(draft);
  return NextResponse.json({ connection });
}
