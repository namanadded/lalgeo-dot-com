import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { surveyUploadsDir } from "@/lib/storage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ surveyId: string; filename: string }> }
) {
  const { surveyId, filename } = await context.params;
  const filePath = path.join(surveyUploadsDir(surveyId), filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
  return new NextResponse(data, { headers: { "Content-Type": contentType } });
}
