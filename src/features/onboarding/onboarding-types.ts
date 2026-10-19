import { z } from "zod";

export const hairLengths = ["短发", "中短发", "中长发", "长发"] as const;
export const hairTextures = ["偏直", "微卷", "卷发", "自然蓬松"] as const;
export const onboardingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  hairLength: z.enum(hairLengths),
  hairTexture: z.enum(hairTextures),
  wardrobeName: z.string().trim().min(1).max(80),
}).strict();
export type OnboardingInput = z.infer<typeof onboardingSchema>;
