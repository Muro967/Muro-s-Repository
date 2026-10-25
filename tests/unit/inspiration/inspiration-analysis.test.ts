import { mergeAnalysis } from "@/features/inspiration/inspiration-analysis";
import type { InspirationAnalysis, InspirationAnalysisTarget } from "@/features/inspiration/inspiration-types";

const current = (overrides: Partial<InspirationAnalysisTarget> = {}): InspirationAnalysisTarget => ({
  styleTags: ["极简"],
  colorNames: ["黑"],
  silhouettes: ["直筒"],
  keyItems: ["衬衫"],
  combinations: ["衬衫+长裤"],
  formality: "通勤",
  confirmedFields: [],
  version: 1,
  ...overrides,
});

const incoming: InspirationAnalysis = {
  styleTags: ["法式"],
  colorNames: ["米白"],
  silhouettes: ["宽松"],
  keyItems: ["针织衫"],
  combinations: ["针织衫+半裙"],
  formality: "休闲",
};

test("merges a current analysis and increments its version", () => {
  expect(mergeAnalysis(current(), incoming, 1)).toEqual({
    ...incoming,
    confirmedFields: [],
    version: 2,
    applied: true,
    appliedFields: ["styleTags", "colorNames", "silhouettes", "keyItems", "combinations", "formality"],
  });
});

test("never replaces fields that a person confirmed", () => {
  const result = mergeAnalysis(current({
    confirmedFields: ["colorNames", "formality"],
  }), incoming, 1);

  expect(result.colorNames).toEqual(["黑"]);
  expect(result.formality).toBe("通勤");
  expect(result.styleTags).toEqual(["法式"]);
  expect(result.appliedFields).not.toContain("colorNames");
  expect(result.appliedFields).not.toContain("formality");
});

test("rejects a stale analysis without changing data or version", () => {
  const latest = current({ version: 2, colorNames: ["灰绿"] });
  expect(mergeAnalysis(latest, incoming, 1)).toEqual({
    ...latest,
    applied: false,
    appliedFields: [],
  });
});

test("returns no write when every analyzable field is confirmed", () => {
  const protectedCurrent = current({
    confirmedFields: ["styleTags", "colorNames", "silhouettes", "keyItems", "combinations", "formality"],
  });
  expect(mergeAnalysis(protectedCurrent, incoming, 1)).toEqual({
    ...protectedCurrent,
    applied: false,
    appliedFields: [],
  });
});

test("does not mutate the saved record or provider result", () => {
  const saved = current();
  const savedBefore = structuredClone(saved);
  const incomingBefore = structuredClone(incoming);
  mergeAnalysis(saved, incoming, 1);
  expect(saved).toEqual(savedBefore);
  expect(incoming).toEqual(incomingBefore);
});
