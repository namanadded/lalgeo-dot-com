import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { enforceSurveyCap, ensureSurveyDirs, surveyUploadsDir } from "../../lib/storage";
import { findSurveyByPublicId, getSurvey } from "../../lib/surveys";
import { getSessionFromCookie } from "../../lib/auth-pages";

export const config = {
  api: {
    bodyParser: false,
  },
};

function safeName(original: string) {
  return original.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const form = formidable({ multiples: true, keepExtensions: true });

  form.parse(req, (err: Error | null, fields: Record<string, unknown>, files: Record<string, unknown>) => {
    if (err) {
      res.status(400).json({ error: "Invalid upload" });
      return;
    }

    const surveyIdField = String(fields.surveyId || "");
    const publicIdField = String(fields.publicId || "");
    if (surveyIdField) {
      const session = getSessionFromCookie(req.headers.cookie);
      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    const survey = surveyIdField ? getSurvey(surveyIdField) : findSurveyByPublicId(publicIdField);
    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const fileValue = files.file;
    const fileList = Array.isArray(fileValue) ? fileValue : [fileValue].filter(Boolean);
    if (fileList.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const totalIncoming = fileList.reduce((sum, file) => sum + (file?.size || 0), 0);
    try {
      enforceSurveyCap(survey.id, totalIncoming);
    } catch (capErr) {
      const message = capErr instanceof Error ? capErr.message : "Survey size limit reached";
      res.status(413).json({ error: message });
      return;
    }

    ensureSurveyDirs(survey.id);
    const uploadDir = surveyUploadsDir(survey.id);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const stored: { name: string; storedName: string; url: string }[] = [];
    for (const file of fileList) {
      if (!file || !file.filepath) continue;
      const original = safeName(file.originalFilename || "upload.bin");
      const storedName = `${Date.now()}-${original}`;
      const dest = path.join(uploadDir, storedName);
      fs.copyFileSync(file.filepath, dest);
      stored.push({
        name: original,
        storedName,
        url: `/survey/api/uploads/${survey.id}/${storedName}`,
      });
    }

    res.status(200).json({ files: stored });
  });
}
