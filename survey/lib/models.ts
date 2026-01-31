export type QuestionType = "text" | "number" | "dropdown" | "multiChoice" | "picture";

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  pictureSize?: "small" | "medium" | "large";
}

export interface SurveyDefinition {
  id: string;
  publicId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
}

export interface SurveyResponse {
  id: string;
  submittedAt: string;
  answers: Record<string, string>;
  lat?: number;
  lon?: number;
  attachments?: Record<string, string[]>;
}

export interface StorageIndexEntry {
  id: string;
  publicId: string;
  name: string;
  updatedAt: string;
  responseCount: number;
  sizeBytes: number;
}
