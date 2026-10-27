import { z } from "zod";

import { itemCategories } from "../items/item-catalog";
import { itemRequest } from "../items/item-upload-client";
import type { Recreation } from "./recreation-types";

const recreationSchema = z.object({
  id: z.uuid(),
  inspirationId: z.uuid(),
  mode: z.enum(["rules", "openai", "qwen"]),
  items: z.array(z.object({
    itemId: z.uuid(),
    slot: z.string(),
    name: z.string(),
    categoryId: z.enum(itemCategories.map(({ id }) => id)),
    colorNames: z.array(z.string()),
    imageUrl: z.string().nullable(),
  })),
  similarities: z.array(z.string()),
  missing: z.array(z.string()),
  createdAt: z.iso.datetime(),
});

const responseSchema = z.object({ recreation: recreationSchema });

export const recreationClient = {
  async create(inspirationId: string, signal?: AbortSignal): Promise<Recreation> {
    return (await itemRequest(`/api/inspirations/${inspirationId}/recreations`, "POST", responseSchema, {}, signal)).recreation;
  },
  async read(recreationId: string, signal?: AbortSignal): Promise<Recreation> {
    return (await itemRequest(`/api/recreations/${recreationId}`, "GET", responseSchema, undefined, signal)).recreation;
  },
};
