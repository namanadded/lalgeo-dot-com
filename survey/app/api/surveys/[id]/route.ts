import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSurvey, updateSurvey } from "@/lib/surveys";
import { enforceSurveyCap } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const survey = getSurvey(params.id);
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ survey });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updates = await req.json();
  try {
    enforceSurveyCap(params.id);
    const survey = updateSurvey(params.id, updates);
    return NextResponse.json({ survey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update survey";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
