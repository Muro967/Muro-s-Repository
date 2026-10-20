// @vitest-environment node
import { createIdleService } from "@/features/idle/idle-service";
import { idleFixture } from "../../helpers/idle-fixture";

vi.mock("server-only", () => ({}));
let f: Awaited<ReturnType<typeof idleFixture>>;
beforeEach(async () => { f = await idleFixture(); });
afterEach(async () => { await f.client.close(); });

test("updates only provided owned settings and preserves the other tenant", async () => {
  expect(await f.settingsService.readIdleSettings(f.user.id)).toEqual({ idleDays: 90, watchDays: 30, timeZone: "UTC", seasonOverride: null });
  await f.settingsService.updateIdleSettings(f.user.id, { idleDays: 3650, watchDays: 365, timeZone: "Asia/Shanghai", seasonOverride: "summer" });
  expect(await f.settingsService.updateIdleSettings(f.user.id, { seasonOverride: null })).toEqual({ idleDays: 3650, watchDays: 365, timeZone: "Asia/Shanghai", seasonOverride: null });
  expect(await f.settingsService.readIdleSettings(f.other.id)).toEqual({ idleDays: 90, watchDays: 30, timeZone: "UTC", seasonOverride: null });
  await expect(f.settingsService.updateIdleSettings(f.user.id, { watchDays: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("dashboard derives local dates, seasons and overdue state without mutating persisted status", async () => {
  const id = await f.item({ status: "watching", seasonIds: ["summer"] });
  const service = createIdleService(f.repository, () => new Date("2026-10-20T00:30:00Z"));
  await f.settingsService.updateIdleSettings(f.user.id, { timeZone: "America/Los_Angeles", seasonOverride: "summer" });
  const dashboard = await service.readIdleDashboard(f.user.id);
  expect(dashboard).toMatchObject({ today: "2026-10-19", currentSeason: "summer", items: [{ id, isIdle: true, isWatchOverdue: true }] });
  expect(await f.state(id)).toMatchObject({ status: "watching", watch_due_on: "2026-10-15" });
  await f.settingsService.updateIdleSettings(f.user.id, { seasonOverride: null });
  expect((await service.readIdleDashboard(f.user.id)).statistics.idleCount).toBe(0);
});

test("dashboard counts truthful denominators, six methods and separate currency income with safe projections", async () => {
  const idle = await f.item();
  await f.item({ status: "watching" });
  await f.item({ addedOn: "2026-10-01" });
  await f.item({ status: "draft" });
  await f.item({ deleted: true });
  await f.item({ userId: f.other.id });
  for (const method of ["sold", "gifted", "donated", "recycled", "upcycled", "discarded"]) {
    await f.service.disposeItem(f.user.id, await f.item(), { method, disposedOn: "2026-10-19", ...(method === "sold" ? { saleAmountMinor: 18000, currency: "CNY", platform: "闲鱼" } : method === "gifted" ? { recipient: "朋友" } : {}) });
  }
  await f.service.disposeItem(f.user.id, await f.item(), { method: "sold", disposedOn: "2026-10-19", saleAmountMinor: 900, currency: "USD", platform: "Other" });
  const dashboard = await f.service.readIdleDashboard(f.user.id);
  expect(dashboard.statistics).toEqual({ availableCount: 3, idleCount: 2, disposedCount: 7, idleRate: 2 / 3, disposalRate: 7 / 9, methodTotals: { sold: 2, gifted: 1, donated: 1, recycled: 1, upcycled: 1, discarded: 1 }, soldIncomeByCurrency: { CNY: 18000, USD: 900 } });
  expect(dashboard.items.map((i) => i.id)).toContain(idle);
  expect(dashboard.items).toHaveLength(2);
  expect(dashboard.disposals).toHaveLength(7);
  expect(JSON.stringify(dashboard)).not.toMatch(/userId|objectKey|passwordHash|uploadId|wearCount/);
});

test("projects each disposed garment with safe metadata and private image URL while omitting unknown income", async () => {
  const id = await f.item();
  await f.client.query(`update items set notes='private garment note' where id=$1`, [id]);
  const uploadId = (await f.client.query<{ id: string }>(`insert into uploads (user_id,object_key,kind,content_type,size_bytes,status,completed_at) values ($1,'private/secret-original','wardrobe-original','image/jpeg',100,'completed','2026-01-01') returning id`, [f.user.id])).rows[0]!.id;
  const assetId = (await f.client.query<{ id: string }>(`insert into item_assets (user_id,item_id,upload_id,role) values ($1,$2,$3,'original') returning id`, [f.user.id, id, uploadId])).rows[0]!.id;
  await f.service.disposeItem(f.user.id, id, { method: "sold", disposedOn: "2026-10-19", platform: "闲鱼" });
  await f.service.disposeItem(f.user.id, await f.item(), { method: "gifted", disposedOn: "2026-10-19" });
  const dashboard = await f.service.readIdleDashboard(f.user.id);
  expect(dashboard.disposals.find((record) => record.itemId === id)).toMatchObject({ saleAmountMinor: null, currency: null, item: { id, name: "Shirt", categoryId: "tops", original: { assetId, contentUrl: `/api/items/${id}/assets/${assetId}/content` } } });
  expect(dashboard.statistics.soldIncomeByCurrency).toEqual({});
  expect(dashboard.statistics.methodTotals).toMatchObject({ sold: 1, gifted: 1 });
  expect(dashboard.items).toEqual([]);
  expect(JSON.stringify(dashboard)).not.toMatch(/userId|objectKey|uploadId|secret-original|private garment note/);
});
