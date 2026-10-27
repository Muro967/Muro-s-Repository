import type { CategoryId, ItemStatus, StyleId } from "../items/item-types";
import type { InspirationDetail } from "../inspiration/inspiration-types";
import type { StyleProfileDraft, StyleRuleInput } from "../style/style-types";

export type RecreationInspiration = Pick<InspirationDetail,
  "id" | "version" | "styleTags" | "colorNames" | "silhouettes" |
  "keyItems" | "combinations" | "formality">;

export type RecreationCandidate = {
  id: string;
  userId: string;
  name: string;
  categoryId: CategoryId;
  accessoryId: string | null;
  colorNames: string[];
  styleIds: StyleId[];
  material: string | null;
  fit: string | null;
  length: string | null;
  formality: string | null;
  status: ItemStatus;
  deletedAt: string | null;
  updatedAt: string;
};

export type RecreationInputSnapshot = {
  inspiration: RecreationInspiration;
  styleProfileInputVersion: string | null;
  enabledRules: Array<{ type: StyleRuleInput["type"]; value: string }>;
  candidateVersions: Array<{ itemId: string; updatedAt: string }>;
};

export type RecreationDraft = {
  mode: "rules" | "openai" | "qwen";
  items: Array<{ itemId: string; slot: string; score: number }>;
  similarities: string[];
  missing: string[];
  inputSnapshot: RecreationInputSnapshot;
};

export type RecreationItem = {
  itemId: string;
  slot: string;
  name: string;
  categoryId: CategoryId;
  colorNames: string[];
  imageUrl: string | null;
};

export type Recreation = {
  id: string;
  inspirationId: string;
  mode: RecreationDraft["mode"];
  items: RecreationItem[];
  similarities: string[];
  missing: string[];
  createdAt: string;
};

export type RuleRecreationInput = {
  userId: string;
  inspiration: RecreationInspiration;
  styleProfile: (StyleProfileDraft & { inputVersion?: string }) | null;
  enabledRules: StyleRuleInput[];
  candidates: RecreationCandidate[];
};

export type AiRecreationInput = {
  inspiration: RecreationInputSnapshot["inspiration"];
  styleProfile: StyleProfileDraft | null;
  enabledRules: StyleRuleInput[];
  candidates: Array<{ token: string; slot: string; description: string }>;
};

export type AiRecreationDraft = {
  selections: Array<{ token: string; slot: string }>;
  similarities: string[];
  missing: string[];
};
