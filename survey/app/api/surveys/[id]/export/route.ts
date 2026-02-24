import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSurvey, listResponses } from "@/lib/surveys";
import { createLalPackage } from "@/lib/lal";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const survey = getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const responses = listResponses(id);
  const buffer = createLalPackage(survey, responses);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${survey.name}.lal\"`,
    },
  });
}
