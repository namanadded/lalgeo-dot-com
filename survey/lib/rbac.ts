import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export async function requireSignedIn(nextPath = "/login") {
  const user = await getSessionUser();
  if (!user) {
    redirect(nextPath);
  }
  return user;
}

export async function requireAdmin(nextPath = "/dashboard?error=admin_required") {
  const user = await requireSignedIn("/login");
  if (user.role !== "admin") {
    redirect(nextPath);
  }
  return user;
}

export function canEditDelete(role: string) {
  return role === "admin";
}
