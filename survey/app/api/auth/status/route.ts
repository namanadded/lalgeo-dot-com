import { NextResponse } from "next/server";
import { hasUsers } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ hasUsers: hasUsers() });
}
