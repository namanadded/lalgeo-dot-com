import { NextResponse } from "next/server";
import { findSurveyByPublicId } from "@/lib/surveys";

export async function GET(
  _req: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const survey = findSurveyByPublicId(publicId);
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ survey });
}
