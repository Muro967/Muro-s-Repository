// @vitest-environment node
import { DrizzleItemRepository } from "@/server/db/drizzle-item-repository";
import { idleFixture } from "../../helpers/idle-fixture";

vi.mock("server-only", () => ({}));
let f: Awaited<ReturnType<typeof idleFixture>>;
beforeEach(async () => { f = await idleFixture(); });
afterEach(async () => { await f.client.close(); });
const sold = { method: "sold", saleAmountMinor: 18000, currency: "CNY", platform: "闲鱼", disposedOn: "2026-10-19" };

test("starts a fixed watch window only for an idle active item and cancels without changing last-worn", async () => {
  const id = await f.item();
  await f.service.startWatching(f.user.id, id, {});
  expect(await f.state(id)).toMatchObject({ status: "watching", watch_started_on: "2026-10-19", watch_due_on: "2026-11-18" });
  await f.settingsService.updateIdleSettings(f.user.id, { watchDays: 5 });
  await f.service.startWatching(f.user.id, id, {});
  expect(await f.state(id)).toMatchObject({ watch_due_on: "2026-11-18" });
  await f.service.cancelWatching(f.user.id, id, {});
  await f.service.cancelWatching(f.user.id, id, {});
  expect(await f.state(id)).toMatchObject({ status: "active", watch_started_on: null, watch_due_on: null, manual_last_worn_on: null });
  for (const options of [{ addedOn: "2026-10-01" }, { seasonIds: ["summer"] }, { status: "draft" as const }, { status: "disposed" as const }, { deleted: true }]) {
    const invalid = await f.item(options);
    await expect(f.service.startWatching(f.user.id, invalid, {})).rejects.toMatchObject({ code: "INVALID_STATE" });
  }
});

test("commits one disposal atomically and makes concurrent retries return the original record", async () => {
  const id = await f.item({ status: "watching" });
  const [first, second] = await Promise.all([f.service.disposeItem(f.user.id, id, sold), f.service.disposeItem(f.user.id, id, sold)]);
  expect(first).toEqual(second);
  expect(await f.state(id)).toMatchObject({ status: "disposed", watch_started_on: null, watch_due_on: null });
  expect((await f.client.query(`select count(*)::int as count,sum(sale_amount_minor)::int as income from disposal_records where item_id=$1`, [id])).rows).toEqual([{ count: 1, income: 18000 }]);
  await expect(f.service.startWatching(f.user.id, id, {})).rejects.toMatchObject({ code: "INVALID_STATE" });
  for (const options of [{ status: "draft" as const }, { deleted: true }]) await expect(f.service.disposeItem(f.user.id, await f.item(options), sold)).rejects.toMatchObject({ code: "INVALID_STATE" });
});

test("rolls back both record and status when a later item update fails", async () => {
  const id = await f.item({ status: "watching" });
  await f.client.exec(`create function reject_disposed_update() returns trigger language plpgsql as $$ begin if new.status='disposed' then raise exception 'injected private failure'; end if; return new; end $$; create trigger reject_disposed before update on items for each row execute function reject_disposed_update()`);
  await expect(f.service.disposeItem(f.user.id, id, sold)).rejects.toThrow("Idle persistence failed");
  expect(await f.state(id)).toMatchObject({ status: "watching", watch_due_on: "2026-10-15" });
  expect((await f.client.query(`select count(*)::int as count from disposal_records where item_id=$1`, [id])).rows).toEqual([{ count: 0 }]);
});

test("serializes watch against disposal into a legal final disposed state", async () => {
  const id = await f.item();
  const outcomes = await Promise.allSettled([f.service.startWatching(f.user.id, id, {}), f.service.disposeItem(f.user.id, id, sold)]);
  expect(outcomes[1]!.status).toBe("fulfilled");
  if (outcomes[0]!.status === "rejected") expect(outcomes[0]!.reason).toMatchObject({ code: "INVALID_STATE" });
  expect(await f.state(id)).toMatchObject({ status: "disposed", watch_started_on: null, watch_due_on: null });
  expect((await f.service.readIdleDashboard(f.user.id)).statistics.soldIncomeByCurrency).toEqual({ CNY: 18000 });
});

test("manual last-worn editing on or after watch start clears watch dates atomically", async () => {
  const repository = new DrizzleItemRepository(f.database);
  const id = await f.item({ status: "watching" });
  const uploadId = (await f.client.query<{ id: string }>(`insert into uploads (user_id,object_key,kind,content_type,size_bytes,status,completed_at) values ($1,'private/photo','wardrobe-original','image/jpeg',100,'completed','2026-01-01') returning id`, [f.user.id])).rows[0]!.id;
  await f.client.query(`insert into item_assets (user_id,item_id,upload_id,role) values ($1,$2,$3,'original')`, [f.user.id, id, uploadId]);
  await repository.updateItem(f.user.id, id, { manualLastWornOn: "2026-09-30" });
  expect(await f.state(id)).toMatchObject({ status: "watching", watch_started_on: "2026-10-01" });
  await repository.updateItem(f.user.id, id, { manualLastWornOn: "2026-10-01" });
  expect(await f.state(id)).toMatchObject({ status: "active", watch_started_on: null, watch_due_on: null, manual_last_worn_on: "2026-10-01" });
});
