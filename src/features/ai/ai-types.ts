import { z } from "zod";

import type { InspirationAnalysis } from "../inspiration/inspiration-types";
import type { AiRecreationDraft, AiRecreationInput } from "../recreation/recreation-types";
import type { StyleProfileDraft, StyleSuggestionInput } from "../style/style-types";

export const inspirationAnalysisSchema = z.strictObject({
  styleTags: z.array(z.string().trim().min(1).max(80)).max(3),
  colorNames: z.array(z.string().trim().min(1).max(80)).max(12),
  silhouettes: z.array(z.string().trim().min(1).max(80)).max(12),
  keyItems: z.array(z.string().trim().min(1).max(80)).max(12),
  combinations: z.array(z.string().trim().min(1).max(160)).max(12),
  formality: z.string().trim().max(80).nullable(),
});

export const styleProfileDraftSchema = z.strictObject({
  preferredColors: z.array(z.string().trim().min(1).max(160)).max(5),
  preferredSilhouettes: z.array(z.string().trim().min(1).max(160)).max(5),
  commonCombinations: z.array(z.string().trim().min(1).max(160)).max(5),
  formalityTendency: z.string().trim().max(80).nullable(),
  likedExamples: z.array(z.uuid()).max(3),
});

export const aiRecreationDraftSchema = z.strictObject({
  selections: z.array(z.strictObject({ token: z.string().min(1).max(80), slot: z.string().min(1).max(80) })).max(7),
  similarities: z.array(z.string().trim().min(1).max(240)).max(5),
  missing: z.array(z.string().trim().min(1).max(80)).max(5),
});

export class AiError extends Error {
  constructor(readonly code: "AI_UNAVAILABLE" | "AI_RATE_LIMITED" | "AI_TIMEOUT" | "AI_INVALID_RESPONSE") {
    super(code);
    this.name = "AiError";
  }
}

export interface AiProvider {
  readonly kind: "openai" | "qwen";
  analyzeInspiration(input: { image: Uint8Array; mimeType: string }): Promise<InspirationAnalysis>;
  suggestStyleProfile(input: StyleSuggestionInput): Promise<StyleProfileDraft>;
  recreate(input: AiRecreationInput): Promise<AiRecreationDraft>;
}
