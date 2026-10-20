import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { itemAssets, items, userSettings, wardrobes, zones } from "@/server/db/schema";
import type { AppDatabase, PgliteAppDatabase } from "@/server/db/types";
import { deriveIdleState } from "../idle/idle-policy";
import { accessorySubcategories, itemCategories, itemStyles } from "./item-catalog";
import { ItemError } from "./item-repository";
import { calendarDate } from "./item-lifecycle";

const cursorShape = z.strictObject({ worn: z.iso.date().nullable(), created: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/), id: z.uuid(), binding: z.string().length(64) });
const cursorText = z.string().max(1600).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
const querySchema = z.strictObject({
  scope: z.enum(["browse", "drafts", "trash"]).default("browse"),
  limit: z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().max(60)).default(30),
  q: z.string().trim().refine((s) => [...s].length <= 80).default(""),
  wardrobeId: z.uuid().optional(), zoneId: z.uuid().optional(),
  categoryId: z.enum(itemCategories.map((c) => c.id)).optional(), styleId: z.enum(itemStyles.map((s) => s.id)).optional(),
  accessoryId: z.enum(accessorySubcategories.map((c) => c.id)).optional(), idle: z.literal("true").optional(), cursor: cursorText.optional(),
});
export type ItemQuery = z.infer<typeof querySchema>;
export function parseItemQuery(params: URLSearchParams): ItemQuery {
  if ([...params.keys()].length !== new Set(params.keys()).size) throw new ItemError("INVALID_INPUT");
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || (parsed.data.idle && parsed.data.scope !== "browse")) throw new ItemError("INVALID_INPUT");
  return parsed.data;
}
function signature(value: string, key: string) { return createHmac("sha256", key).update(`wardrobe-item-cursor-v1:${value}`).digest("base64url"); }
function decodeCursor(raw: string, binding: string, key: string) {
  try {
    const [payload, mac] = raw.split(".");
    const expected = signature(payload!, key);
    if (mac!.length !== expected.length || !timingSafeEqual(Buffer.from(mac!), Buffer.from(expected))) throw new Error();
    const bytes = Buffer.from(payload!, "base64url");
    if (bytes.toString("base64url") !== payload) throw new Error();
    const parsed = cursorShape.parse(JSON.parse(bytes.toString("utf8")));
    if (parsed.binding !== binding || !Number.isFinite(Date.parse(parsed.created))) throw new Error();
    return parsed;
  } catch { throw new ItemError("INVALID_INPUT"); }
}
export async function queryItems(database: AppDatabase, userId: string, query: ItemQuery, now: Date | string, key: string) {
  const { cursor: rawCursor, limit: _limit, ...filters } = query; void _limit;
  const binding = createHmac("sha256", key).update(JSON.stringify({ userId, filters })).digest("hex");
  const cursor = rawCursor ? decodeCursor(rawCursor, binding, key) : null;
  return (database as PgliteAppDatabase).transaction(async (db) => {
    // Counts, facets, policy state and page are read from the same snapshot.
    await db.execute(sql`set transaction isolation level repeatable read`);
    if (query.wardrobeId) {
      const [found] = await db.select({ id: wardrobes.id }).from(wardrobes).where(and(eq(wardrobes.userId, userId), eq(wardrobes.id, query.wardrobeId)));
      if (!found) throw new ItemError("NOT_FOUND");
    }
    if (query.zoneId) {
      const [found] = await db.select({ id: zones.id }).from(zones).where(and(eq(zones.userId, userId), eq(zones.id, query.zoneId), query.wardrobeId ? eq(zones.wardrobeId, query.wardrobeId) : undefined));
      if (!found) throw new ItemError("NOT_FOUND");
    }
    const location = and(eq(items.userId, userId), query.wardrobeId ? eq(items.wardrobeId, query.wardrobeId) : undefined, query.zoneId ? eq(items.zoneId, query.zoneId) : undefined);
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    const today = typeof now === "string" ? now : calendarDate(now, settings?.timeZone ?? "UTC");
    // Northern meteorological seasons, using the user's local calendar month unless overridden.
    const month = Number(today.slice(5, 7));
    const currentSeason = settings?.seasonOverride ?? (month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter");
    const metadata = await db.select({ id: items.id, status: items.status, categoryId: items.categoryId, accessoryId: items.accessoryId, styleIds: items.styleIds, seasonIds: items.seasonIds, addedOn: items.addedOn, manualLastWornOn: items.manualLastWornOn, watchDueOn: items.watchDueOn }).from(items).where(and(location, isNull(items.deletedAt), inArray(items.status, ["active", "watching", "draft"])));
    const summary = { itemCount: 0, watchingCount: 0, idleCount: 0, draftCount: 0 };
    const facets: { categories: Record<string, number>; styles: Record<string, number>; accessories: Record<string, number> } = { categories: {}, styles: {}, accessories: {} };
    const idleIds: string[] = [];
    for (const item of metadata) {
      if (item.status === "draft") { summary.draftCount++; continue; }
      summary.itemCount++; if (item.status === "watching") summary.watchingCount++;
      if (deriveIdleState(item, settings ?? { idleDays: 90, watchDays: 30 }, { today, currentSeason }).isIdle) { summary.idleCount++; idleIds.push(item.id); }
      if (item.categoryId) facets.categories[item.categoryId] = (facets.categories[item.categoryId] ?? 0) + 1;
      for (const id of item.styleIds) facets.styles[id] = (facets.styles[id] ?? 0) + 1;
      if (item.accessoryId) facets.accessories[item.accessoryId] = (facets.accessories[item.accessoryId] ?? 0) + 1;
    }
    const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    const categoryMatches = itemCategories.filter((c) => c.label.includes(query.q)).map((c) => c.id);
    const filter = and(location,
      query.scope === "trash" ? isNotNull(items.deletedAt) : and(isNull(items.deletedAt), query.scope === "drafts" ? eq(items.status, "draft") : inArray(items.status, ["active", "watching"])),
      query.categoryId ? eq(items.categoryId, query.categoryId) : undefined,
      query.accessoryId ? eq(items.accessoryId, query.accessoryId) : undefined,
      query.styleId ? sql`${items.styleIds} @> ${JSON.stringify([query.styleId])}::jsonb` : undefined,
      query.idle ? (idleIds.length ? inArray(items.id, idleIds) : sql`false`) : undefined,
      query.q ? or(sql`${items.name} ilike ${pattern} escape '\\'`, sql`exists (select 1 from jsonb_array_elements_text(${items.colorNames}) color(value) where color.value ilike ${pattern} escape '\\')`, sql`${wardrobes.name} ilike ${pattern} escape '\\'`, sql`${zones.name} ilike ${pattern} escape '\\'`, categoryMatches.length ? inArray(items.categoryId, categoryMatches) : sql`false`) : undefined);
    const joins = () => db.select({ value: count() }).from(items).leftJoin(wardrobes, and(eq(wardrobes.id, items.wardrobeId), eq(wardrobes.userId, userId))).leftJoin(zones, and(eq(zones.id, items.zoneId), eq(zones.userId, userId)));
    const [total] = await joins().where(filter);
    const tail = cursor ? sql`(${items.createdAt}, ${items.id}) < (${cursor.created}::timestamptz, ${cursor.id}::uuid)` : undefined;
    const seek = cursor ? (cursor.worn === null ? and(isNull(items.manualLastWornOn), tail) : or(isNull(items.manualLastWornOn), sql`${items.manualLastWornOn} < ${cursor.worn}::date`, and(eq(items.manualLastWornOn, cursor.worn), tail))) : undefined;
    const rows = await db.select({ id: items.id, name: items.name, status: items.status, categoryId: items.categoryId, accessoryId: items.accessoryId, styleIds: items.styleIds, colorNames: items.colorNames, seasonIds: items.seasonIds, manualLastWornOn: items.manualLastWornOn, createdAt: items.createdAt, deletedAt: items.deletedAt, wardrobeId: items.wardrobeId, zoneId: items.zoneId, wardrobeName: wardrobes.name, zoneName: zones.name, assetId: itemAssets.id, cursorCreated: sql<string>`to_char(${items.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(items)
      .leftJoin(wardrobes, and(eq(wardrobes.id, items.wardrobeId), eq(wardrobes.userId, userId)))
      .leftJoin(zones, and(eq(zones.id, items.zoneId), eq(zones.userId, userId)))
      .leftJoin(itemAssets, and(eq(itemAssets.itemId, items.id), eq(itemAssets.userId, userId), eq(itemAssets.role, "original")))
      .where(and(filter, seek)).orderBy(sql`${items.manualLastWornOn} desc nulls last`, desc(items.createdAt), desc(items.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit); const last = page.at(-1);
    let nextCursor: string | null = null;
    if (rows.length > query.limit && last) {
      const value = Buffer.from(JSON.stringify({ worn: last.manualLastWornOn, created: last.cursorCreated, id: last.id, binding })).toString("base64url");
      nextCursor = `${value}.${signature(value, key)}`;
    }
    return { items: page.map(({ cursorCreated: _cursor, assetId, ...item }) => { void _cursor; return { ...item, isIdle: idleIds.includes(item.id), original: assetId ? { assetId, contentUrl: `/api/items/${item.id}/assets/${assetId}/content` } : null, createdAt: item.createdAt.toISOString(), deletedAt: item.deletedAt?.toISOString() ?? null, deletedOn: item.deletedAt ? calendarDate(item.deletedAt, settings?.timeZone ?? "UTC") : null }; }), total: total!.value, nextCursor, summary, facets, today };
  });
}
