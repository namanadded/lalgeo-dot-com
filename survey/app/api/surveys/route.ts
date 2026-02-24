import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createSurvey, listSurveys } from "@/lib/surveys";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ surveys: listSurveys() });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const survey = createSurvey(name, description || undefined);
  return NextResponse.json({ survey });
}
