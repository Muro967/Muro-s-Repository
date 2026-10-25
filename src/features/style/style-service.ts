import { z } from "zod";

import { aggregateStyleProfile } from "./style-aggregation";
import {
  StyleError,
  type StyleRepository,
} from "./style-repository";
import {
  styleRuleTypes,
  type StyleProfileDraft,
  type StyleRuleInput,
} from "./style-types";

const textList = z.array(z.string().trim().min(1).max(160)).max(5)
  .transform((values) => [...new Set(values)]);
const profileSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime(),
  preferredColors: textList,
  preferredSilhouettes: textList,
  commonCombinations: textList,
  formalityTendency: z.string().trim().max(80).nullable(),
  likedExamples: z.array(z.uuid()).max(3),
});
const timestampSchema = z.strictObject({ expectedUpdatedAt: z.iso.datetime() });
const ruleBase = {
  type: z.enum(styleRuleTypes),
  value: z.string().trim().min(1),
  enabled: z.boolean(),
};
const ruleCreateSchema = z.strictObject(ruleBase).superRefine((value, context) => {
  const maximum = value.type === "text" ? 240 : 80;
  if ([...value.value].length > maximum) context.addIssue({ code: "custom", message: "Rule is too long.", path: ["value"] });
});
const ruleUpdateSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime(),
  type: ruleBase.type.optional(),
  value: ruleBase.value.optional(),
  enabled: ruleBase.enabled.optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"))
  .superRefine((value, context) => {
    const maximum = value.type === "text" ? 240 : 80;
    if (value.value && [...value.value].length > maximum) context.addIssue({ code: "custom", message: "Rule is too long.", path: ["value"] });
  });

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new StyleError("INVALID_INPUT");
  return result.data;
}

export function createStyleService({ repository }: { repository: StyleRepository }) {
  return {
    async read(userId: string) {
      const [inspirations, current, rules] = await Promise.all([
        repository.readInspirations(userId),
        repository.readProfile(userId),
        repository.listRules(userId),
      ]);
      const aggregation = aggregateStyleProfile(inspirations);
      return {
        validCount: aggregation.validCount,
        remaining: aggregation.status.kind === "insufficient" ? aggregation.status.remaining : 0,
        current,
        rules,
      };
    },
    async regenerate(userId: string) {
      const inspirations = await repository.readInspirations(userId);
      const aggregation = aggregateStyleProfile(inspirations);
      if (aggregation.status.kind === "insufficient") {
        return {
          validCount: aggregation.validCount,
          remaining: aggregation.status.remaining,
          current: await repository.readProfile(userId),
        };
      }
      const current = await repository.saveSuggestion(userId, {
        ...aggregation.status.profile,
        source: "rules",
        inputVersion: aggregation.status.inputVersion,
      });
      return { validCount: aggregation.validCount, remaining: 0, current };
    },
    updateProfile(userId: string, input: unknown) {
      const value = parsed(profileSchema, input);
      const { expectedUpdatedAt, ...draft } = value;
      return repository.updateProfile(userId, expectedUpdatedAt, draft as StyleProfileDraft);
    },
    acceptSuggestion(userId: string, input: unknown) {
      const value = parsed(timestampSchema, input);
      return repository.acceptSuggestion(userId, value.expectedUpdatedAt);
    },
    async createRule(userId: string, input: unknown) {
      return repository.createRule(userId, parsed(ruleCreateSchema, input) as StyleRuleInput);
    },
    async updateRule(userId: string, id: string, input: unknown) {
      if (!z.uuid().safeParse(id).success) throw new StyleError("NOT_FOUND");
      const value = parsed(ruleUpdateSchema, input);
      const { expectedUpdatedAt, ...patch } = value;
      return repository.updateRule(userId, id, expectedUpdatedAt, patch);
    },
    async deleteRule(userId: string, id: string, input: unknown) {
      if (!z.uuid().safeParse(id).success) throw new StyleError("NOT_FOUND");
      const value = parsed(timestampSchema, input);
      return repository.deleteRule(userId, id, value.expectedUpdatedAt);
    },
  };
}
