import type { StyleProfileDraft, StyleRule } from "../style/style-types";
import type {
  Recreation,
  RecreationCandidate,
  RecreationDraft,
  RecreationInspiration,
} from "./recreation-types";

export type RecreationInputs = {
  inspiration: RecreationInspiration;
  styleProfile: (StyleProfileDraft & { inputVersion: string }) | null;
  rules: StyleRule[];
  candidates: RecreationCandidate[];
};

export class RecreationError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_INPUT" | "CANDIDATES_CHANGED" | "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE") {
    super(code);
    this.name = "RecreationError";
  }
}

export interface RecreationRepository {
  readInputs(userId: string, inspirationId: string): Promise<RecreationInputs | null>;
  save(userId: string, inspirationId: string, draft: RecreationDraft): Promise<Recreation | "CANDIDATES_CHANGED">;
  find(userId: string, recreationId: string): Promise<Recreation | null>;
}
