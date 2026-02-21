import { NextResponse } from "next/server";
import { createUser, hasUsers, setSession } from "@/lib/auth";
import { ensureStorageLayout } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    ensureStorageLayout();
    if (hasUsers()) {
      return NextResponse.json({ error: "Setup already completed." }, { status: 400 });
    }
    const body = await req.json();
    const email = String(body.email || "").trim();
    const password = String(body.password || "").trim();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required." }, { status: 400 });
    }
    const user = createUser(email, password);
    setSession(user);
    return NextResponse.json({ ok: true, email: user.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
