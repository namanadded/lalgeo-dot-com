import { NextResponse } from "next/server";
import { findSurveyByPublicId } from "@/lib/surveys";

export async function GET(_req: Request, { params }: { params: { publicId: string } }) {
  const survey = findSurveyByPublicId(params.publicId);
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ survey });
}
