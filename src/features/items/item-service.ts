import "server-only";
import { z } from "zod";
import { accessorySubcategories, itemCategories, itemStyles, seasons } from "./item-catalog";
import { ItemError, type ItemRepository } from "./item-repository";
import { pastOrTodayDateSchema } from "./item-validation";
import type { StorageProvider } from "../storage/storage-provider";
import { verifyCompletedImage } from "../storage/verified-image";

const boundedText = (max: number, min = 0) => z.string().trim().refine((value) => [...value].length >= min && [...value].length <= max);
const unique = <T extends z.ZodType>(schema: T, max: number) => z.array(schema).max(max).refine((values) => new Set(values).size === values.length);
export function editableItemSchema(today: string) {
  return z.strictObject({
    name: boundedText(80).optional(),
    categoryId: z.enum(itemCategories.map(({ id }) => id)).nullable().optional(),
    accessoryId: z.enum(accessorySubcategories.map(({ id }) => id)).nullable().optional(),
    colorNames: unique(boundedText(32, 1), 8).optional(),
    colorHexes: unique(z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((s) => s.toUpperCase()), 8).optional(),
    styleIds: unique(z.enum(itemStyles.map(({ id }) => id)), 12).optional(),
    seasonIds: unique(z.enum(seasons.map(({ id }) => id)), 4).optional(),
    thickness: boundedText(80).nullable().optional(), material: boundedText(80).nullable().optional(),
    fit: boundedText(80).nullable().optional(), length: boundedText(80).nullable().optional(),
    formality: boundedText(80).nullable().optional(), brand: boundedText(80).nullable().optional(),
    notes: boundedText(1000).nullable().optional(), wardrobeId: z.uuid().nullable().optional(),
    zoneId: z.uuid().nullable().optional(), manualLastWornOn: pastOrTodayDateSchema(today).nullable().optional(),
  });
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ItemError("INVALID_INPUT");
  return parsed.data;
}
export function itemResourceId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new ItemError("NOT_FOUND");
  return id;
}
export type ItemServiceDependencies = { repository: ItemRepository; provider: StorageProvider; today: () => string };
export function createItemService({ repository, provider, today }: ItemServiceDependencies) {
  return {
    async createDraft(userId: string, input: unknown) { return repository.createDraft(userId, parse(editableItemSchema(today()), input)); },
    async updateItem(userId: string, id: string, input: unknown) { return repository.updateItem(userId, itemResourceId(id), parse(editableItemSchema(today()), input)); },
    async readItem(userId: string, id: string) {
      const item = await repository.findItem(userId, itemResourceId(id));
      if (!item) throw new ItemError("NOT_FOUND");
      return item;
    },
    async activateItem(userId: string, id: string, input: unknown = {}) {
      parse(z.strictObject({}), input);
      return repository.activateItem(userId, itemResourceId(id), today());
    },
    async attachOriginal(userId: string, id: string, uploadId: string) {
      itemResourceId(id); itemResourceId(uploadId);
      const item = await repository.findItem(userId, id);
      if (!item) throw new ItemError("NOT_FOUND");
      if (item.deletedAt || !["draft", "active"].includes(item.status)) throw new ItemError("ITEM_NOT_EDITABLE");
      const upload = await repository.findCompletedOriginalUpload(userId, uploadId);
      if (!upload) throw new ItemError("NOT_FOUND");
      const image = await verifyCompletedImage(upload, provider).catch(() => {
        throw new ItemError("INVALID_IMAGE");
      });
      await repository.attachOriginal(userId, id, uploadId, image);
    },
  };
}
