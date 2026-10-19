import { z } from "zod";
import { accessorySubcategories, itemCategories, itemStyles, seasons } from "./item-catalog";
import { itemRequest } from "./item-upload-client";
import type { EditableItemPatch } from "./item-repository";

const itemSchema = z.object({
  id: z.uuid(), name: z.string(), categoryId: z.enum(itemCategories.map(({ id }) => id)).nullable(), accessoryId: z.enum(accessorySubcategories.map(({ id }) => id)).nullable(),
  colorNames: z.array(z.string()), colorHexes: z.array(z.string()), styleIds: z.array(z.enum(itemStyles.map(({ id }) => id))), seasonIds: z.array(z.enum(seasons.map(({ id }) => id))),
  thickness: z.string().nullable(), material: z.string().nullable(), fit: z.string().nullable(), length: z.string().nullable(), formality: z.string().nullable(), brand: z.string().nullable(), notes: z.string().nullable(),
  wardrobeId: z.uuid().nullable(), zoneId: z.uuid().nullable(), manualLastWornOn: z.string().nullable(), status: z.enum(["draft", "active", "watching", "disposed"]),
  original: z.object({ id: z.uuid(), uploadId: z.uuid() }).nullable(), addedOn: z.string().nullable(), watchStartedOn: z.string().nullable(), watchDueOn: z.string().nullable(),
  deletedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});
export type EditorItem = z.infer<typeof itemSchema>;
const envelope = z.object({ item: itemSchema });
const path = (id: string) => `/api/items/${encodeURIComponent(id)}`;
export const itemEditorClient = {
  async create(signal?: AbortSignal) { return (await itemRequest("/api/items", "POST", envelope, {}, signal)).item; },
  async read(id: string, signal?: AbortSignal) { return (await itemRequest(path(id), "GET", envelope, undefined, signal)).item; },
  async save(id: string, input: EditableItemPatch, signal?: AbortSignal) { return (await itemRequest(path(id), "PATCH", envelope, input, signal)).item; },
  async activate(id: string, signal?: AbortSignal) { return (await itemRequest(`${path(id)}/activate`, "POST", envelope, {}, signal)).item; },
  attach(id: string, uploadId: string, signal?: AbortSignal) { return itemRequest(`${path(id)}/original`, "PUT", z.object({ ok: z.literal(true) }), { uploadId }, signal); },
};
