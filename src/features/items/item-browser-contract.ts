import { z } from "zod";

const counts = z.record(z.string(), z.number().int().nonnegative());
export const browserItemSchema = z.object({
 id: z.uuid(), name: z.string(), status: z.enum(["active", "watching", "draft", "disposed"]),
 categoryId: z.string().nullable(), accessoryId: z.string().nullable(),
 styleIds: z.array(z.string()).default([]), colorNames: z.array(z.string()).default([]), seasonIds: z.array(z.string()).default([]),
 manualLastWornOn: z.iso.date().nullable(), createdAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable(),
 deletedOn: z.iso.date().nullable().optional(),
 wardrobeId: z.uuid().nullable(), zoneId: z.uuid().nullable(), wardrobeName: z.string().nullable(), zoneName: z.string().nullable(), isIdle: z.boolean(),
 original: z.strictObject({ assetId: z.uuid(), contentUrl: z.string() }).nullable(),
}).superRefine((item, ctx) => {
 if (item.original && item.original.contentUrl !== `/api/items/${item.id}/assets/${item.original.assetId}/content`) ctx.addIssue({ code: "custom", message: "Invalid private image" });
});
export const browserResponseSchema = z.object({ items: z.array(browserItemSchema), total: z.number().int().nonnegative(), nextCursor: z.string().nullable(), today: z.iso.date(), summary: z.object({ itemCount: z.number(), draftCount: z.number(), watchingCount: z.number(), idleCount: z.number() }), facets: z.object({ categories: counts, styles: counts, accessories: counts }) });
export type BrowserItem = z.infer<typeof browserItemSchema>;
export type BrowserResponse = z.infer<typeof browserResponseSchema>;
export const browserWardrobesSchema = z.object({ wardrobes: z.array(z.object({ id: z.uuid(), name: z.string(), zones: z.array(z.object({ id: z.uuid(), name: z.string(), wardrobeId: z.uuid() })) })) });
export type BrowserWardrobe = z.infer<typeof browserWardrobesSchema>["wardrobes"][number];
