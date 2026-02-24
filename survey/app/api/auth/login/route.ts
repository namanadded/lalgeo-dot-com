import { NextResponse } from "next/server";
import { authenticate, setSession } from "@/lib/auth";
import { ensureStorageLayout } from "@/lib/storage";

export async function POST(req: Request) {
  ensureStorageLayout();
  const body = await req.json();
  const email = String(body.email || "").trim();
  const password = String(body.password || "").trim();
  const user = authenticate(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  await setSession(user);
  return NextResponse.json({ ok: true, email: user.email });
}
