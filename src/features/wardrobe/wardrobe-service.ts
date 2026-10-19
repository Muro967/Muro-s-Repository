import "server-only";
import { z } from "zod";
import { WardrobeError, type WardrobeRepository } from "./wardrobe-repository";
import { zoneKinds } from "./wardrobe-types";

const name = z.string().trim().min(1).max(80).refine((value) => /[^\s\p{Cf}\p{Cc}]/u.test(value));
export const wardrobeNameSchema = z.strictObject({ name });
export const createZoneSchema = z.strictObject({ name, kind: z.enum(zoneKinds) });
export const deleteLocationSchema = z.strictObject({ destinationZoneId: z.uuid().optional() });
export const reorderLocationsSchema = z.strictObject({ orderedIds: z.array(z.uuid()) });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new WardrobeError("INVALID_INPUT");
  return parsed.data;
}
function resourceId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new WardrobeError("NOT_FOUND");
  return id;
}
export function createWardrobeService(repository: WardrobeRepository) {
  return {
    list: (userId: string) => repository.list(userId),
    async createWardrobe(userId: string, input: unknown) { return repository.createWardrobe(userId, parse(wardrobeNameSchema, input)); },
    async renameWardrobe(userId: string, id: string, input: unknown) { return repository.renameWardrobe(userId, resourceId(id), parse(wardrobeNameSchema, input).name); },
    async reorderWardrobes(userId: string, orderedIds: unknown) { return repository.reorderWardrobes(userId, parse(z.array(z.uuid()), orderedIds)); },
    async deleteWardrobe(userId: string, id: string, input: unknown) { return repository.deleteWardrobe(userId, resourceId(id), parse(deleteLocationSchema, input).destinationZoneId); },
    async createZone(userId: string, id: string, input: unknown) { return repository.createZone(userId, resourceId(id), parse(createZoneSchema, input)); },
    async renameZone(userId: string, id: string, input: unknown) { return repository.renameZone(userId, resourceId(id), parse(wardrobeNameSchema, input).name); },
    async reorderZones(userId: string, id: string, orderedIds: unknown) { return repository.reorderZones(userId, resourceId(id), parse(z.array(z.uuid()), orderedIds)); },
    async deleteZone(userId: string, id: string, input: unknown) { return repository.deleteZone(userId, resourceId(id), parse(deleteLocationSchema, input).destinationZoneId); },
  };
}
