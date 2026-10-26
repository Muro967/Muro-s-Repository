import { z } from "zod";
import type { AiProvider } from "../ai/ai-types";
import { itemCategories, itemStyles } from "../items/item-catalog";

import { buildRuleRecreation, eligibleRecreationCandidates } from "./recreation-engine";
import { RecreationError, type RecreationRepository } from "./recreation-repository";

const identifier = z.uuid();

const categoryLabels = new Map(itemCategories.map(({ id, label }) => [id, label]));
const styleLabels = new Map(itemStyles.map(({ id, label }) => [id, label]));

export function createRecreationService({ repository, provider = null }: { repository: RecreationRepository; provider?: AiProvider | null }) {
  const inputs = async (userId: string, inspirationId: string) => {
    if (!identifier.safeParse(inspirationId).success) throw new RecreationError("NOT_FOUND");
    const value = await repository.readInputs(userId, inspirationId);
    if (!value) throw new RecreationError("NOT_FOUND");
    return value;
  };

  return {
    async create(userId: string, inspirationId: string, mode: "rules" | "ai" = "rules") {
      for (let attempt = 0; attempt < 2; attempt++) {
        const value = await inputs(userId, inspirationId);
        const engineInput = {
          userId,
          inspiration: value.inspiration,
          styleProfile: value.styleProfile,
          enabledRules: value.rules.filter((rule) => rule.enabled),
          candidates: value.candidates,
        };
        const ruleDraft = buildRuleRecreation(engineInput);
        let draft = ruleDraft;
        if (mode === "ai") {
          if (!provider) throw new RecreationError("AI_UNAVAILABLE");
          const candidates = eligibleRecreationCandidates(engineInput);
          const tokenMap = new Map(candidates.map((candidate, index) => [`c${index + 1}`, candidate]));
          const ai = await provider.recreate({
            inspiration: value.inspiration,
            styleProfile: value.styleProfile,
            enabledRules: engineInput.enabledRules,
            candidates: [...tokenMap].map(([token, candidate]) => ({
              token,
              slot: categoryLabels.get(candidate.categoryId) ?? candidate.categoryId,
              description: [candidate.name, ...candidate.colorNames, ...candidate.styleIds.map((id) => styleLabels.get(id) ?? id), candidate.fit, candidate.length, candidate.material, candidate.formality].filter(Boolean).join(" · "),
            })),
          });
          const seen = new Set<string>();
          const selected = ai.selections.map(({ token }) => {
            const candidate = tokenMap.get(token);
            if (!candidate || seen.has(token)) throw new RecreationError("AI_INVALID_RESPONSE");
            seen.add(token);
            return candidate;
          });
          const categories = new Set(selected.map(({ categoryId }) => categoryId));
          if (!categories.has("dresses") && !(categories.has("tops") && categories.has("bottoms"))) throw new RecreationError("AI_INVALID_RESPONSE");
          draft = {
            mode: provider.kind,
            items: selected.map((candidate) => ({ itemId: candidate.id, slot: categoryLabels.get(candidate.categoryId) ?? candidate.categoryId, score: 0 })),
            similarities: ai.similarities,
            missing: ai.missing,
            inputSnapshot: ruleDraft.inputSnapshot,
          };
        }
        const saved = await repository.save(userId, inspirationId, draft);
        if (saved !== "CANDIDATES_CHANGED") return saved;
      }
      throw new RecreationError("CANDIDATES_CHANGED");
    },
    async read(userId: string, recreationId: string) {
      if (!identifier.safeParse(recreationId).success) throw new RecreationError("NOT_FOUND");
      const value = await repository.find(userId, recreationId);
      if (!value) throw new RecreationError("NOT_FOUND");
      return value;
    },
  };
}
