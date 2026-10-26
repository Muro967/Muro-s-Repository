import type {
  StyleInspiration,
  StyleProfileDraft,
  StyleRule,
  StyleRuleInput,
  StyleSuggestion,
} from "./style-types";

export type StyleProfile = StyleSuggestion & {
  manuallyEdited: boolean;
  pendingSuggestion: StyleSuggestion | null;
  updatedAt: string;
};

export class StyleError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_INPUT" | "VERSION_CONFLICT" | "AI_UNAVAILABLE") {
    super(code);
    this.name = "StyleError";
  }
}

export interface StyleRepository {
  readInspirations(userId: string): Promise<StyleInspiration[]>;
  readProfile(userId: string): Promise<StyleProfile | null>;
  listRules(userId: string): Promise<StyleRule[]>;
  saveSuggestion(userId: string, suggestion: StyleSuggestion): Promise<StyleProfile>;
  updateProfile(
    userId: string,
    expectedUpdatedAt: string,
    draft: StyleProfileDraft,
  ): Promise<StyleProfile>;
  acceptSuggestion(userId: string, expectedUpdatedAt: string): Promise<StyleProfile>;
  createRule(userId: string, input: StyleRuleInput): Promise<StyleRule>;
  updateRule(
    userId: string,
    id: string,
    expectedUpdatedAt: string,
    input: Partial<StyleRuleInput>,
  ): Promise<StyleRule>;
  deleteRule(userId: string, id: string, expectedUpdatedAt: string): Promise<void>;
}
