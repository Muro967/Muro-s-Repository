import type { InspirationField } from "../inspiration/inspiration-types";

export const styleRuleTypes = ["color", "style", "fit", "material", "formality", "text"] as const;

export type StyleRuleType = (typeof styleRuleTypes)[number];

export type StyleProfileDraft = {
  preferredColors: string[];
  preferredSilhouettes: string[];
  commonCombinations: string[];
  formalityTendency: string | null;
  likedExamples: string[];
};

export type StyleRuleInput = {
  type: StyleRuleType;
  value: string;
  enabled: boolean;
};

export type StyleRule = StyleRuleInput & {
  id: string;
  updatedAt: string;
};

export type StyleInspiration = {
  id: string;
  version: number;
  styleTags: string[];
  colorNames: string[];
  silhouettes: string[];
  keyItems: string[];
  combinations: string[];
  formality: string | null;
  confirmedFields: InspirationField[];
  updatedAt: string;
};

export type StyleSuggestion = StyleProfileDraft & {
  source: "rules" | "openai" | "qwen";
  inputVersion: string;
};

export type StyleSuggestionInput = {
  inspirations: StyleInspiration[];
  enabledRules: StyleRuleInput[];
};
