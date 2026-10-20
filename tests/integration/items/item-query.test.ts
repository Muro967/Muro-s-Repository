// @vitest-environment node
import { randomUUID } from "node:crypto";
import { queryItems, parseItemQuery } from "@/features/items/item-query";
import { items, userSettings } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { itemFixture } from "../../helpers/item-fixture";
vi.mock("server-only", () => ({}));
let f: Awaited<ReturnType<typeof itemFixture>>;
beforeEach(async () => { f = await itemFixture(); });
afterEach(async () => { await f.client.close(); });
const key = "test-cursor-signing-key-with-thirty-two-characters";
const query = (input = "") => queryItems(f.database, f.user.id, parseItemQuery(new URLSearchParams(input)), "2026-10-19", key);
async function insert(overrides: Partial<typeof items.$inferInsert> = {}) {
  const [item] = await f.database.insert(items).values({ ...f.complete, categoryId: "tops", userId: f.user.id, status: "active", addedOn: "2026-01-01", ...overrides }).returning();
  return item!;
}
test("rejects unknown duplicate malformed and out-of-bounds query fields", () => {
  for (const raw of ["wat=x", "q=a&q=b", "limit=0", "limit=61", "limit=1.2", "limit=01", "scope=disposed", "wardrobeId=bad", "categoryId=fake", "styleId=fake", "accessoryId=fake", "idle=false", "scope=drafts&idle=true", "scope=trash&idle=true", "cursor=bad", `q=${"🧥".repeat(81)}`]) expect(() => parseItemQuery(new URLSearchParams(raw))).toThrow();
  expect(parseItemQuery(new URLSearchParams(`q=  ${"🧥".repeat(80)}  `)).q).toBe("🧥".repeat(80));
});
test("searches literal percent underscore and backslash and every promised text field", async () => {
  const literal = await insert({ name: "100%_棉\\布", colorNames: ["雾蓝"], styleIds: ["french"] });
  await insert({ name: "100XX棉布", categoryId: "bottoms" });
  for (const q of ["100%_棉", "\\", "雾蓝"]) expect((await query(`q=${encodeURIComponent(q)}`)).items.map((i) => i.id)).toEqual([literal.id]);
  expect((await query("q=上装")).total).toBe(1);
  expect((await query(`q=${encodeURIComponent(f.source.name)}`)).total).toBe(2);
  expect((await query(`q=${encodeURIComponent(f.source.zones[0]!.name)}`)).total).toBe(2);
  expect((await query("styleId=french")).total).toBe(1);
  expect((await query("styleId=french")).items[0]).toMatchObject({ styleIds: ["french"], colorNames: ["雾蓝"], seasonIds: [] });
  const body = JSON.stringify(await query()); expect(body).not.toMatch(/objectKey|uploadId|password|userId/);
});
test("keeps scopes and tenants separate and derives idle from settings and season", async () => {
  await insert();
  await insert({ status: "watching", watchStartedOn: "2026-10-01", watchDueOn: "2026-10-31", seasonIds: ["summer"] });
  await insert({ status: "draft" }); await insert({ status: "disposed" }); await insert({ deletedAt: new Date("2026-10-01") });
  await insert({ userId: f.other.id, wardrobeId: f.foreign.id, zoneId: f.foreign.zones[0]!.id });
  const result = await query();
  expect(result.total).toBe(2); expect(result.summary).toEqual({ itemCount: 2, watchingCount: 1, idleCount: 1, draftCount: 1 });
  expect(result.facets).toEqual({ categories: { tops: 2 }, styles: {}, accessories: {} });
  expect(result.items.find((i) => i.status === "active")).toMatchObject({ isIdle: true, original: null });
  expect((await query("q=unmatched")).summary).toEqual(result.summary);
  expect((await query("q=unmatched")).facets).toEqual(result.facets);
  expect((await query("scope=drafts")).items.map((i) => i.status)).toEqual(["draft"]);
  expect((await query("scope=trash")).total).toBe(1);
  expect((await query("idle=true")).total).toBe(1);
  await f.database.update(userSettings).set({ seasonOverride: "summer", idleDays: 365 }).where(eq(userSettings.userId, f.user.id));
  expect((await query()).summary.idleCount).toBe(0);
  await expect(query(`wardrobeId=${f.foreign.id}`)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(query(`wardrobeId=${randomUUID()}`)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
test("paginates the exact last-worn null-last timestamp id tuple without duplicates and rejects cursor tampering", async () => {
  const rows = [];
  for (const date of [null, "2026-10-10", "2026-10-10", "2026-10-09", null]) rows.push(await insert({ manualLastWornOn: date, createdAt: new Date("2026-10-01T12:00:00Z") }));
  const expected = [...rows].sort((a, b) => (b.manualLastWornOn ?? "").localeCompare(a.manualLastWornOn ?? "") || b.id.localeCompare(a.id)).map((i) => i.id);
  let cursor: string | null = null; const seen: string[] = [];
  do { const page = await query(`limit=2${cursor ? `&cursor=${cursor}` : ""}`); expect(page.total).toBe(5); seen.push(...page.items.map((i) => i.id)); cursor = page.nextCursor; } while (cursor);
  expect(seen).toEqual(expected);
  const first = await query("limit=2");
  await expect(query(`q=other&cursor=${first.nextCursor}`)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(query(`cursor=${first.nextCursor!.slice(0, -3)}aaa`)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
test("derives today and current season from the injected instant in the user's IANA zone", async () => {
 await f.database.update(userSettings).set({ timeZone: "America/Los_Angeles" }).where(eq(userSettings.userId, f.user.id));
 await insert({ seasonIds: ["summer"] });
 const result = await queryItems(f.database, f.user.id, parseItemQuery(new URLSearchParams()), new Date("2026-09-01T01:00:00Z"), key);
 expect(result.today).toBe("2026-08-31"); expect(result.summary.idleCount).toBe(1);
});
test("exposes only same-origin original images and the local deletion date in trash", async () => {
 await f.database.update(userSettings).set({ timeZone: "America/Los_Angeles" }).where(eq(userSettings.userId, f.user.id));
 const item = await f.service.createDraft(f.user.id, { ...f.complete, notes: "PRIVATE NOTE" });
 const upload = await f.upload(); await f.service.attachOriginal(f.user.id, item.id, upload.id);
 await f.repository.softDeleteItem(f.user.id, item.id, new Date("2026-10-01T01:00:00Z"));
 const result = await query("scope=trash");
 expect(result.items[0]).toMatchObject({ deletedOn: "2026-09-30", original: { assetId: expect.any(String), contentUrl: expect.stringMatching(/^\/api\/items\//) } });
 expect(JSON.stringify(result)).not.toMatch(/objectKey|uploadId|PRIVATE NOTE|private\//);
});
test("preserves microsecond ordering, binds cursors to user and normalizes whitespace", async () => {
 const older = await insert({ name: "needle", createdAt: new Date("2026-10-01") });
 const newer = await insert({ name: "needle", createdAt: new Date("2026-10-01") });
 await f.database.execute(sql`update items set created_at = '2026-10-01T00:00:00.000001Z' where id = ${older.id}`);
 await f.database.execute(sql`update items set created_at = '2026-10-01T00:00:00.000002Z' where id = ${newer.id}`);
 const page = await query("limit=1&q=%20needle%20"); expect(page.items.map((i) => i.id)).toEqual([newer.id]);
 expect((await query(`limit=1&q=needle&cursor=${page.nextCursor}`)).items.map((i) => i.id)).toEqual([older.id]);
 await expect(queryItems(f.database, f.other.id, parseItemQuery(new URLSearchParams(`q=needle&cursor=${page.nextCursor}`)), "2026-10-19", key)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
