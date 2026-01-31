import AdmZip from "adm-zip";
import { SurveyDefinition, SurveyResponse, QuestionType } from "./models";

const TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text Answer",
  number: "Numerical Field",
  dropdown: "Dropdown Choice",
  multiChoice: "Multiple Choice",
  picture: "Picture",
};

export function buildSurveyCsv(def: SurveyDefinition, responses: SurveyResponse[]): string {
  const lines: string[] = [];
  lines.push(["Question", "Type", "Choices", "Required"].join(","));
  for (const q of def.questions) {
    const choices = q.options.join("|");
    const required = q.required ? "Yes" : "";
    lines.push([escapeCsv(q.text), escapeCsv(TYPE_LABELS[q.type]), escapeCsv(choices), required].join(","));
  }
  lines.push("");
  lines.push("Responses");
  const headers = buildFields(def);
  lines.push(headers.map(escapeCsv).join(","));
  for (const response of responses) {
    const row = headers.map((field) => {
      if (field === "id") return response.id;
      if (field === "date") return response.submittedAt;
      if (field === "lat") return response.lat?.toString() ?? "";
      if (field === "lon") return response.lon?.toString() ?? "";
      return response.answers[field] ?? "";
    });
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export function buildSurveyJson(def: SurveyDefinition, responses: SurveyResponse[]) {
  const fields = buildFields(def);
  const questionMeta: Record<string, { type: string; normalizedType: string; choices: string[]; required: boolean }> = {};
  for (const q of def.questions) {
    questionMeta[q.text] = {
      type: q.type,
      normalizedType: q.type,
      choices: q.options,
      required: q.required,
    };
  }
  const points = responses.map((response) => ({
    id: response.id,
    lat: response.lat ?? null,
    lon: response.lon ?? null,
    attributes: response.answers,
    version: null,
    updatedAt: response.submittedAt,
    updatedBy: "LalGeo Web",
  }));
  return {
    version: 1,
    updatedAt: def.updatedAt,
    updatedBy: "LalGeo Web",
    fields,
    latField: "lat",
    lonField: "lon",
    questionMeta,
    points,
    archivedPoints: null,
    mapSymbol: null,
  };
}

export function buildMetadata(def: SurveyDefinition) {
  return {
    id: def.id,
    name: def.name,
    geometryType: "point",
    questions: def.questions.map((q) => ({
      text: q.text,
      type: q.type,
      options: q.options,
      isRequired: q.required,
    })),
    inspectionLocations: null,
    mapSymbol: null,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
    createdBy: "LalGeo Web",
    deviceName: "LalGeo Cloud",
    system: "Web",
    appVersion: "survey-web",
  };
}

export function createLalPackage(def: SurveyDefinition, responses: SurveyResponse[]) {
  const zip = new AdmZip();
  const csv = buildSurveyCsv(def, responses);
  const surveyJson = JSON.stringify(buildSurveyJson(def, responses));
  const metadataJson = JSON.stringify(buildMetadata(def));
  zip.addFile("survey.csv", Buffer.from(csv, "utf8"));
  zip.addFile("survey.json", Buffer.from(surveyJson, "utf8"));
  zip.addFile("metadata.json", Buffer.from(metadataJson, "utf8"));
  return zip.toBuffer();
}

function buildFields(def: SurveyDefinition) {
  return ["id", "date", "lat", "lon", ...def.questions.map((q) => q.text)];
}

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}
