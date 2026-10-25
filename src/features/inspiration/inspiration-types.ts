export const inspirationFields = [
  "name",
  "styleTags",
  "colorNames",
  "silhouettes",
  "keyItems",
  "combinations",
  "formality",
] as const;

export const inspirationAnalysisFields = [
  "styleTags",
  "colorNames",
  "silhouettes",
  "keyItems",
  "combinations",
  "formality",
] as const;

export const inspirationAnalysisStatuses = ["manual", "queued", "running", "ready", "failed"] as const;
export const inspirationAnalysisSources = ["openai", "qwen"] as const;

export type InspirationField = (typeof inspirationFields)[number];
export type InspirationAnalysisField = (typeof inspirationAnalysisFields)[number];
export type InspirationAnalysisStatus = (typeof inspirationAnalysisStatuses)[number];
export type InspirationAnalysisSource = (typeof inspirationAnalysisSources)[number];

export type InspirationAnalysis = {
  styleTags: string[];
  colorNames: string[];
  silhouettes: string[];
  keyItems: string[];
  combinations: string[];
  formality: string | null;
};

export type EditableInspiration = InspirationAnalysis & {
  name: string;
  notes: string | null;
  confirmedFields: InspirationField[];
};

export type EditableInspirationPatch = Partial<EditableInspiration>;

export type InspirationDetail = EditableInspiration & {
  id: string;
  imageUrl: string;
  analysisStatus: InspirationAnalysisStatus;
  analysisSource: InspirationAnalysisSource | null;
  analysisErrorCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type InspirationAnalysisTarget = InspirationAnalysis & {
  confirmedFields: InspirationField[];
  version: number;
};

export type InspirationAnalysisMerge = InspirationAnalysisTarget & {
  applied: boolean;
  appliedFields: InspirationAnalysisField[];
};

export type ValidInspirationCandidate = {
  deletedAt: Date | string | null;
  uploadReady: boolean;
  styleTags: string[];
  colorNames: string[];
};
