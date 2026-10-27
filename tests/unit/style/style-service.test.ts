import { createStyleService } from "@/features/style/style-service";
import type { StyleProfile, StyleRepository } from "@/features/style/style-repository";
import type { StyleInspiration, StyleRule } from "@/features/style/style-types";
import type { AiProvider } from "@/features/ai/ai-types";

const inspirations: StyleInspiration[] = Array.from({ length: 5 }, (_, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 1}`,
  version: 1,
  styleTags: ["法式"],
  colorNames: ["米白"],
  silhouettes: ["宽松"],
  keyItems: ["风衣"],
  combinations: ["风衣+阔腿裤"],
  formality: "通勤",
  confirmedFields: [],
  updatedAt: "2026-10-19T00:00:00.000Z",
}));

class FakeRepository implements StyleRepository {
  inspirations = inspirations;
  current: StyleProfile | null = null;
  rules: StyleRule[] = [];
  readInspirations = vi.fn(async () => this.inspirations);
  readProfile = vi.fn(async () => this.current);
  listRules = vi.fn(async () => this.rules);
  saveSuggestion = vi.fn(async (_userId, suggestion) => {
    if (this.current?.manuallyEdited) {
      this.current = { ...this.current, pendingSuggestion: suggestion };
    } else {
      this.current = { ...suggestion, manuallyEdited: false, pendingSuggestion: null, updatedAt: "2026-10-19T00:00:00.000Z" };
    }
    return this.current!;
  });
  updateProfile = vi.fn(async (_userId, _expected, draft) => {
    this.current = { ...draft, source: "rules", inputVersion: "manual", manuallyEdited: true, pendingSuggestion: null, updatedAt: "2026-10-20T00:00:00.000Z" };
    return this.current!;
  });
  acceptSuggestion = vi.fn(async () => this.current!);
  createRule = vi.fn();
  updateRule = vi.fn();
  deleteRule = vi.fn();
}

test("returns the threshold without persisting a profile", async () => {
  const repository = new FakeRepository();
  repository.inspirations = inspirations.slice(0, 4);
  const service = createStyleService({ repository });
  await expect(service.regenerate("user")).resolves.toMatchObject({ remaining: 1, current: null });
  expect(repository.saveSuggestion).not.toHaveBeenCalled();
});

test("keeps a manually edited current version and stores new aggregation as pending", async () => {
  const repository = new FakeRepository();
  repository.current = {
    preferredColors: ["灰绿"],
    preferredSilhouettes: [],
    commonCombinations: [],
    formalityTendency: null,
    likedExamples: [],
    source: "rules",
    inputVersion: "old",
    manuallyEdited: true,
    pendingSuggestion: null,
    updatedAt: "2026-10-19T00:00:00.000Z",
  };
  const before = structuredClone(repository.current);
  const result = await createStyleService({ repository }).regenerate("user");
  expect(result.current).toMatchObject({ ...before, pendingSuggestion: expect.any(Object) });
  expect(result.current?.pendingSuggestion).not.toBeNull();
});

test("validates manual profile and structured/free-text rule lengths", async () => {
  const repository = new FakeRepository();
  const service = createStyleService({ repository });
  await expect(service.updateProfile("user", {
    expectedUpdatedAt: "2026-10-19T00:00:00.000Z",
    preferredColors: ["米白"],
    preferredSilhouettes: [],
    commonCombinations: [],
    formalityTendency: null,
    likedExamples: [],
  })).resolves.toMatchObject({ manuallyEdited: true });
  await expect(service.createRule("user", { type: "color", value: "x".repeat(81), enabled: true })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(service.createRule("user", { type: "text", value: "x".repeat(241), enabled: true })).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("uses an explicitly requested provider while preserving the same persistence guard", async () => {
  const repository = new FakeRepository();
  const suggestion = { preferredColors: ["灰绿"], preferredSilhouettes: ["直线"], commonCombinations: ["衬衫+长裤"], formalityTendency: "通勤", likedExamples: [] };
  const provider: AiProvider = { kind: "openai", analyzeInspiration: vi.fn(), suggestStyleProfile: vi.fn(async () => suggestion), recreate: vi.fn() };
  const result = await createStyleService({ repository, provider }).regenerate("user", "ai");
  expect(provider.suggestStyleProfile).toHaveBeenCalledWith(expect.objectContaining({ inspirations, enabledRules: [] }));
  expect(result.current).toMatchObject({ ...suggestion, source: "openai" });
  await expect(createStyleService({ repository, provider: null }).regenerate("user", "ai")).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
});
