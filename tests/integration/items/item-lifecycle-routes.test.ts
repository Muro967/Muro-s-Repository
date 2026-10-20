// @vitest-environment node
import { createItemHandlers } from "@/features/items/item-routes";
import { items, userSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { itemFixture } from "../../helpers/item-fixture";
import { jsonRequest } from "../../helpers/http-request";
import { token } from "../../helpers/wardrobe-fixture";
vi.mock("server-only", () => ({}));
let f: Awaited<ReturnType<typeof itemFixture>>;
beforeEach(async () => { f = await itemFixture(); });
afterEach(async () => { await f.client.close(); });
function request(body: unknown = {}) { const r = jsonRequest("/api/items", body); r.headers.set("cookie", `aiw_session=${token}`); return r; }
async function watching() {
 const i = await f.service.createDraft(f.user.id, f.complete); const u = await f.upload(); await f.service.attachOriginal(f.user.id, i.id, u.id); await f.service.activateItem(f.user.id, i.id);
 await f.database.update(items).set({ status: "watching", watchStartedOn: "2026-10-01", watchDueOn: "2026-10-31" }).where(eq(items.id, i.id));
 return (await f.service.readItem(f.user.id, i.id));
}
test("soft delete changes only deletedAt once, retains images and status, restores day29 but not day30", async () => {
 const i = await watching(); const now = new Date("2026-10-01T23:59:59Z");
 const h = createItemHandlers({ ...f, now: () => now });
 const removed = await h.remove(request(), i.id);
 expect(removed.status).toBe(200); expect(await removed.json()).toEqual({ ok: true });
 expect(await f.service.readItem(f.user.id, i.id)).toEqual({ ...i, deletedAt: now });
 expect((await createItemHandlers(f).remove(request(), i.id)).status).toBe(200);
 expect((await f.service.readItem(f.user.id, i.id)).deletedAt).toEqual(now);
 expect(f.provider.objects.size).toBe(1);
 expect(await f.repository.findPrivateImage(f.user.id, i.id, i.original!.id)).not.toBeNull();
 const day29 = createItemHandlers({ ...f, today: () => "2026-10-30" });
 expect((await day29.restore(request(), i.id)).status).toBe(200);
 expect(await f.service.readItem(f.user.id, i.id)).toEqual(i);
 expect((await day29.restore(request(), i.id)).status).toBe(200);
 await h.remove(request(), i.id);
 const expired = await createItemHandlers({ ...f, today: () => "2026-10-31" }).restore(request(), i.id);
 expect(expired.status).toBe(409); expect(await expired.json()).toMatchObject({ error: { code: "RESTORE_EXPIRED" } });
 expect((await f.service.readItem(f.user.id, i.id)).deletedAt).toEqual(now);
});
test("expires restore on local calendar day30 and removes upload identifiers from mutation payloads", async () => {
 await f.database.update(userSettings).set({ timeZone: "America/Los_Angeles" }).where(eq(userSettings.userId, f.user.id));
 const item = await watching();
 await f.repository.softDeleteItem(f.user.id, item.id, new Date("2026-10-01T01:00:00Z"));
 const restored = await createItemHandlers({ ...f, today: () => "2026-10-29" }).restore(request(), item.id);
 expect(restored.status).toBe(200); expect(JSON.stringify(await restored.json())).not.toMatch(/uploadId|objectKey/);
 await f.repository.softDeleteItem(f.user.id, item.id, new Date("2026-10-01T01:00:00Z"));
 expect((await createItemHandlers({ ...f, today: () => "2026-10-30" }).restore(request(), item.id)).status).toBe(409);
});
test("moves an owned matching location pair atomically, preserves watching and rolls back rejected writes", async () => {
 const i = await watching(); const h = createItemHandlers(f);
 const dest = await f.wardrobeRepository.createWardrobe(f.user.id, { name: "新衣柜" });
 const zone = await f.wardrobeRepository.createZone(f.user.id, dest.id, { name: "短挂区", kind: "hang" });
 expect((await h.move(request({ wardrobeId: dest.id, zoneId: zone.id }), i.id)).status).toBe(200);
 expect(await f.service.readItem(f.user.id, i.id)).toEqual({ ...i, wardrobeId: dest.id, zoneId: zone.id });
 const before = await f.service.readItem(f.user.id, i.id);
 expect((await h.move(request({ wardrobeId: f.source.id, zoneId: zone.id }), i.id)).status).toBe(404);
 expect((await h.move(request({ wardrobeId: f.foreign.id, zoneId: f.foreign.zones[0]!.id }), i.id)).status).toBe(404);
 await f.client.exec(`alter table items add constraint no_original_location check (wardrobe_id <> '${f.source.id}')`);
 expect((await h.move(request({ wardrobeId: f.source.id, zoneId: f.source.zones[0]!.id }), i.id)).status).toBe(500);
 expect(await f.service.readItem(f.user.id, i.id)).toEqual(before);
});
test("accepts bodyless delete and restore while preserving origin protection", async () => {
 const item = await f.service.createDraft(f.user.id, {}); const h = createItemHandlers(f);
 const headers = { origin: f.appUrl, host: "localhost:3000", cookie: `aiw_session=${token}` };
 expect((await h.remove(new Request(`${f.appUrl}/api/items/${item.id}`, { method: "DELETE", headers }), item.id)).status).toBe(200);
 expect((await h.restore(new Request(`${f.appUrl}/api/items/${item.id}/restore`, { method: "POST", headers }), item.id)).status).toBe(200);
});
test("enforces origin then auth then strict mutation bodies and identical tenant misses", async () => {
 const h = createItemHandlers(f); const foreign = await f.service.createDraft(f.other.id, {});
 for (const action of [h.move, h.remove, h.restore]) {
   const bad = request(); bad.headers.delete("origin"); expect((await action(bad, foreign.id)).status).toBe(403); expect(bad.bodyUsed).toBe(false);
   const anon = request(); anon.headers.delete("cookie"); expect((await action(anon, foreign.id)).status).toBe(401);
   expect((await action(request({ unexpected: true }), foreign.id)).status).toBe(400);
 }
 for (const action of [h.remove, h.restore]) expect((await action(request(), foreign.id)).status).toBe(404);
});
