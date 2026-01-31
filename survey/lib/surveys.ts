import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { SurveyDefinition, SurveyResponse, StorageIndexEntry } from "./models";
import { ensureStorageLayout, ensureSurveyDirs, indexPath, readJson, writeJson, surveyDir, dirSizeBytes } from "./storage";

const SURVEY_FILE = "survey.json";
const RESPONSES_FILE = "responses.jsonl";

export function listSurveys(): StorageIndexEntry[] {
  ensureStorageLayout();
  return readJson<StorageIndexEntry[]>(indexPath(), []);
}

export function getSurvey(id: string): SurveyDefinition | null {
  const filePath = path.join(surveyDir(id), SURVEY_FILE);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as SurveyDefinition;
}

export function saveSurvey(def: SurveyDefinition) {
  ensureSurveyDirs(def.id);
  const filePath = path.join(surveyDir(def.id), SURVEY_FILE);
  writeJson(filePath, def);
  updateIndex(def);
}

export function createSurvey(name: string, description?: string): SurveyDefinition {
  const now = new Date().toISOString();
  const def: SurveyDefinition = {
    id: nanoid(12),
    publicId: nanoid(10),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    questions: [],
  };
  saveSurvey(def);
  return def;
}

export function updateSurvey(id: string, updates: Partial<SurveyDefinition>): SurveyDefinition {
  const existing = getSurvey(id);
  if (!existing) throw new Error("Survey not found");
  const next: SurveyDefinition = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveSurvey(next);
  return next;
}

export function listResponses(id: string): SurveyResponse[] {
  const filePath = path.join(surveyDir(id), RESPONSES_FILE);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as SurveyResponse);
}

export function appendResponse(id: string, response: SurveyResponse) {
  ensureSurveyDirs(id);
  const filePath = path.join(surveyDir(id), RESPONSES_FILE);
  fs.appendFileSync(filePath, JSON.stringify(response) + "\n");
  const survey = getSurvey(id);
  if (survey) updateIndex(survey);
}

export function updateIndex(def: SurveyDefinition) {
  ensureStorageLayout();
  const index = listSurveys();
  const entry: StorageIndexEntry = {
    id: def.id,
    publicId: def.publicId,
    name: def.name,
    updatedAt: def.updatedAt,
    responseCount: listResponses(def.id).length,
    sizeBytes: dirSizeBytes(surveyDir(def.id)),
  };
  const next = index.filter((e) => e.id !== def.id);
  next.unshift(entry);
  writeJson(indexPath(), next);
}

export function findSurveyByPublicId(publicId: string): SurveyDefinition | null {
  const index = listSurveys();
  const entry = index.find((s) => s.publicId === publicId);
  if (!entry) return null;
  return getSurvey(entry.id);
}
