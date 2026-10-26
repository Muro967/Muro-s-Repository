import { z } from "zod";

import { buildRuleRecreation } from "./recreation-engine";
import { RecreationError, type RecreationRepository } from "./recreation-repository";

const identifier = z.uuid();

export function createRecreationService({ repository }: { repository: RecreationRepository }) {
  const inputs = async (userId: string, inspirationId: string) => {
    if (!identifier.safeParse(inspirationId).success) throw new RecreationError("NOT_FOUND");
    const value = await repository.readInputs(userId, inspirationId);
    if (!value) throw new RecreationError("NOT_FOUND");
    return value;
  };

  return {
    async create(userId: string, inspirationId: string) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const value = await inputs(userId, inspirationId);
        const draft = buildRuleRecreation({
          userId,
          inspiration: value.inspiration,
          styleProfile: value.styleProfile,
          enabledRules: value.rules.filter((rule) => rule.enabled),
          candidates: value.candidates,
        });
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
