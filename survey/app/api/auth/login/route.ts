import { NextResponse } from "next/server";
import { authenticate, createUser, hasUsers, setSession } from "@/lib/auth";
import { ensureStorageLayout } from "@/lib/storage";

export async function POST(req: Request) {
  ensureStorageLayout();
  const body = await req.json();
  const email = String(body.email || "").trim();
  const password = String(body.password || "").trim();

  let user = authenticate(email, password);

  // First-login bootstrap for admin: use the same login screen, no separate setup page.
  const adminEmail = (process.env.ADMIN_EMAIL || "naman.malhotra@hotmail.com").toLowerCase();
  if (!user && !hasUsers() && email.toLowerCase() === adminEmail) {
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    user = createUser(email, password, "admin");
  }

  if (!user) {
    const message = hasUsers()
      ? "Invalid credentials."
      : "No account exists yet. Sign in with the admin email to create the first account.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  await setSession(user);
  return NextResponse.json({ ok: true, email: user.email });
}
