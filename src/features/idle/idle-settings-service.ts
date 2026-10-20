import "server-only";
import { z } from "zod";
import { seasons } from "../items/item-catalog";
import { IdleError, type IdleRepository } from "./idle-repository";

export const idleSettingsSchema = z.strictObject({
  idleDays: z.number().int().min(1).max(3650).optional(),
  watchDays: z.number().int().min(1).max(365).optional(),
  timeZone: z.string().refine((value) => {
    if (/^[+-]/.test(value)) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
    catch { return false; }
  }).optional(),
  seasonOverride: z.enum(seasons.map((season) => season.id)).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);

export function createIdleSettingsService(repository: IdleRepository) {
  return {
    async readIdleSettings(userId: string) { return (await repository.readSnapshot(userId)).settings; },
    async updateIdleSettings(userId: string, input: unknown) {
      const parsed = idleSettingsSchema.safeParse(input);
      if (!parsed.success) throw new IdleError("INVALID_INPUT");
      return repository.write(userId, (tx) => tx.updateSettings(parsed.data));
    },
  };
}
