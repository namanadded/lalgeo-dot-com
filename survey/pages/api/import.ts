import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import AdmZip from "adm-zip";
import { createSurvey, updateSurvey } from "../../lib/surveys";
import { getSessionFromCookie } from "../../lib/auth-pages";
import { parseCsvLine } from "../../lib/csv";

export const config = {
  api: {
    bodyParser: false,
  },
};

function mapType(raw: string): "text" | "number" | "dropdown" | "multiChoice" | "picture" {
  const v = raw.toLowerCase();
  if (v.includes("number")) return "number";
  if (v.includes("dropdown")) return "dropdown";
  if (v.includes("multi")) return "multiChoice";
  if (v.includes("picture") || v.includes("photo")) return "picture";
  return "text";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const session = getSessionFromCookie(req.headers.cookie);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const form = formidable({ multiples: false, keepExtensions: true });
  form.parse(req, (err: Error | null, _fields: unknown, files: Record<string, unknown>) => {
    if (err) {
      res.status(400).json({ error: "Invalid file" });
      return;
    }
    const fileValue = files.file;
    const file = Array.isArray(fileValue) ? fileValue[0] : fileValue;
    if (!file || typeof file !== "object" || !("filepath" in file)) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const filepath = (file as { filepath: string }).filepath;
    const zip = new AdmZip(filepath);
    const surveyJsonEntry = zip.getEntry("survey.json");
    const metadataEntry = zip.getEntry("metadata.json");
    const surveyCsvEntry = zip.getEntry("survey.csv");

    let name = "Imported Survey";
    if (metadataEntry) {
      try {
        const meta = JSON.parse(metadataEntry.getData().toString("utf8"));
        if (meta?.name) name = meta.name;
      } catch {}
    }

    const survey = createSurvey(name);

    let questions: { id: string; text: string; type: "text" | "number" | "dropdown" | "multiChoice" | "picture"; options: string[]; required: boolean }[] = [];

    if (surveyJsonEntry) {
      try {
        const doc = JSON.parse(surveyJsonEntry.getData().toString("utf8"));
        const meta = doc?.questionMeta || {};
        questions = Object.keys(meta).map((key) => ({
          id: crypto.randomUUID(),
          text: key,
          type: mapType(meta[key]?.type || meta[key]?.normalizedType || "text"),
          options: Array.isArray(meta[key]?.choices) ? meta[key].choices : [],
          required: Boolean(meta[key]?.required),
        }));
      } catch {}
    } else if (surveyCsvEntry) {
      const csv = surveyCsvEntry.getData().toString("utf8");
      const rows: string[] = csv.split(/\r?\n/).filter((line: string) => line.trim().length > 0);
      let startIndex = rows.findIndex((row: string) => row.toLowerCase().startsWith("question"));
      if (startIndex === -1) startIndex = 0;
      for (let i = startIndex + 1; i < rows.length; i += 1) {
        if (rows[i].toLowerCase().startsWith("responses")) break;
        const cols = parseCsvLine(rows[i]);
        if (cols.length >= 2) {
          const text = cols[0];
          const type = mapType(cols[1]);
          const choices = cols[2] ? cols[2].split("|").map((v) => v.trim()).filter(Boolean) : [];
          const required = (cols[3] || "").toLowerCase().includes("yes");
          questions.push({ id: crypto.randomUUID(), text, type, options: choices, required });
        }
      }
    }

    const updated = updateSurvey(survey.id, { name, questions });
    res.status(200).json({ survey: updated });
  });
}
