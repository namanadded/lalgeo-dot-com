import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { findSurveyByPublicId, appendResponse } from "@/lib/surveys";
import { enforceSurveyCap } from "@/lib/storage";

export async function POST(
  req: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const survey = findSurveyByPublicId(publicId);
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const answers = (body.answers || {}) as Record<string, string>;
  const attachments = (body.attachments || {}) as Record<string, string[]>;
  const lat = body.lat ? Number(body.lat) : undefined;
  const lon = body.lon ? Number(body.lon) : undefined;

  const response = {
    id: nanoid(10),
    submittedAt: new Date().toISOString(),
    answers,
    attachments,
    lat,
    lon,
  };
  try {
    const incomingBytes = Buffer.byteLength(JSON.stringify(response));
    enforceSurveyCap(survey.id, incomingBytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Survey size limit reached";
    return NextResponse.json({ error: message }, { status: 413 });
  }
  appendResponse(survey.id, response);
  return NextResponse.json({ ok: true, responseId: response.id });
}
