// @vitest-environment node
import { wardrobeFixture } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));
let f: Awaited<ReturnType<typeof wardrobeFixture>>;
beforeEach(async () => { f = await wardrobeFixture(); });
afterEach(async () => { await f.client.close(); });

async function retainedItems() {
  for (const status of ["draft", "active", "watching", "disposed"] as const) {
    for (const deleted of [false, true]) {
      await f.client.query(`insert into items (user_id, wardrobe_id, zone_id, status, name, category_id, added_on, watch_started_on, watch_due_on, deleted_at) values ($1,$2,$3,$4,'Shirt','tops','2026-01-01',$5,$6,$7)`, [f.user.id, f.source.id, f.source.zones[0]!.id, status, status === "watching" ? "2026-10-01" : null, status === "watching" ? "2026-10-31" : null, deleted ? "2026-10-19" : null]);
    }
  }
}

test("creates, renames and fully reorders only owned wardrobes and sibling zones", async () => {
  const second = await f.repository.createWardrobe(f.user.id, { name: "Second" });
  const zone = await f.repository.createZone(f.user.id, f.source.id, { name: "Shelf", kind: "shelf" });
  await f.repository.renameWardrobe(f.user.id, second.id, "Renamed");
  await f.repository.renameZone(f.user.id, zone.id, "Folded");
  for (const ids of [[], [f.source.id], [f.source.id, f.source.id]]) {
    await expect(f.repository.reorderWardrobes(f.user.id, ids)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  await expect(f.repository.reorderWardrobes(f.user.id, [f.source.id, f.foreign.id])).rejects.toMatchObject({ code: "NOT_FOUND" });
  await f.repository.reorderWardrobes(f.user.id, [second.id, f.source.id]);
  await f.repository.reorderZones(f.user.id, f.source.id, [zone.id, f.source.zones[0]!.id]);
  const result = await f.repository.list(f.user.id);
  expect(result.map((w) => [w.name, w.sortOrder])).toEqual([["Renamed", 0], ["我的衣柜", 1]]);
  expect(result[1]!.zones.map((z) => [z.name, z.sortOrder])).toEqual([["Folded", 0], ["默认挂衣区", 1]]);
  await expect(f.repository.reorderZones(f.user.id, f.source.id, [zone.id])).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(f.repository.reorderZones(f.user.id, f.source.id, [zone.id, f.foreign.zones[0]!.id])).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("returns NOT_FOUND for foreign containers across mutations and never changes the other tenant", async () => {
  for (const operation of [
    () => f.repository.renameWardrobe(f.user.id, f.foreign.id, "stolen"),
    () => f.repository.deleteWardrobe(f.user.id, f.foreign.id),
    () => f.repository.createZone(f.user.id, f.foreign.id, { name: "stolen", kind: "hang" }),
    () => f.repository.reorderZones(f.user.id, f.foreign.id, []),
    () => f.repository.renameZone(f.user.id, f.foreign.zones[0]!.id, "stolen"),
    () => f.repository.deleteZone(f.user.id, f.foreign.zones[0]!.id),
  ]) await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await f.repository.list(f.other.id)).toEqual([f.foreign]);
});

test("requires a destination for every retained zone item and migrates all statuses including recycle bin", async () => {
  await retainedItems();
  const target = await f.repository.createZone(f.user.id, f.source.id, { name: "Target", kind: "drawer" });
  await expect(f.repository.deleteZone(f.user.id, f.source.zones[0]!.id)).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
  await expect(f.repository.deleteZone(f.user.id, f.source.zones[0]!.id, f.source.zones[0]!.id)).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
  await expect(f.repository.deleteZone(f.user.id, f.source.zones[0]!.id, f.foreign.zones[0]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await f.repository.deleteZone(f.user.id, f.source.zones[0]!.id, target.id);
  expect((await f.client.query(`select wardrobe_id, zone_id from items where user_id=$1`, [f.user.id])).rows).toEqual(Array.from({ length: 8 }, () => ({ wardrobe_id: f.source.id, zone_id: target.id })));
  expect((await f.repository.list(f.user.id))[0]!.zones.map((z) => z.id)).toEqual([target.id]);
});

test("migrates wardrobe-only drafts and all retained garments before deleting a wardrobe", async () => {
  await retainedItems();
  await f.client.query(`insert into items (user_id, wardrobe_id) values ($1,$2)`, [f.user.id, f.source.id]);
  const target = await f.repository.createWardrobe(f.user.id, { name: "Target" });
  const zone = await f.repository.createZone(f.user.id, target.id, { name: "Target", kind: "shoe" });
  await expect(f.repository.deleteWardrobe(f.user.id, f.source.id)).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
  await expect(f.repository.deleteWardrobe(f.user.id, f.source.id, f.source.zones[0]!.id)).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
  await f.repository.deleteWardrobe(f.user.id, f.source.id, zone.id);
  expect((await f.client.query(`select wardrobe_id, zone_id from items where user_id=$1`, [f.user.id])).rows).toEqual(Array.from({ length: 9 }, () => ({ wardrobe_id: target.id, zone_id: zone.id })));
  expect((await f.repository.list(f.user.id)).map((w) => w.id)).toEqual([target.id]);
  await expect(f.repository.deleteWardrobe(f.user.id, target.id)).rejects.toMatchObject({ code: "LAST_WARDROBE" });
});

test("rolls back relocation and container deletion when a later delete fails", async () => {
  await retainedItems();
  const target = await f.repository.createWardrobe(f.user.id, { name: "Target" });
  const zone = await f.repository.createZone(f.user.id, target.id, { name: "Target", kind: "hang" });
  await f.client.exec(`create function reject_container_delete() returns trigger language plpgsql as $$ begin raise exception 'injected-delete-failure'; end $$; create trigger reject_delete before delete on wardrobes for each row execute function reject_container_delete()`);
  await expect(f.repository.deleteWardrobe(f.user.id, f.source.id, zone.id)).rejects.toThrow("Wardrobe persistence failed");
  expect((await f.client.query(`select distinct wardrobe_id, zone_id from items where user_id=$1`, [f.user.id])).rows).toEqual([{ wardrobe_id: f.source.id, zone_id: f.source.zones[0]!.id }]);
  expect((await f.repository.list(f.user.id))[0]).toEqual(f.source);
});

test("allows an empty last zone to be removed and replaced and serializes concurrent append/reorder writes", async () => {
  await f.repository.deleteZone(f.user.id, f.source.zones[0]!.id);
  expect((await f.repository.list(f.user.id))[0]!.zones).toEqual([]);
  await Promise.all([f.repository.createZone(f.user.id, f.source.id, { name: "A", kind: "hang" }), f.repository.createZone(f.user.id, f.source.id, { name: "B", kind: "shelf" })]);
  expect((await f.repository.list(f.user.id))[0]!.zones.map((z) => z.sortOrder)).toEqual([0, 1]);
  await expect(f.repository.deleteWardrobe(f.user.id, f.source.id)).rejects.toMatchObject({ code: "LAST_WARDROBE" });
});

test("moves a deleted draft to another wardrobe when deleting its zone and preserves the target tenant", async () => {
  const target = await f.repository.createWardrobe(f.user.id, { name: "Second" });
  const destination = await f.repository.createZone(f.user.id, target.id, { name: "Destination", kind: "shelf" });
  await f.client.query(`insert into items (user_id, wardrobe_id, zone_id, deleted_at) values ($1,$2,$3,'2026-10-19')`, [f.user.id, f.source.id, f.source.zones[0]!.id]);
  await f.repository.deleteZone(f.user.id, f.source.zones[0]!.id, destination.id);
  expect((await f.client.query(`select wardrobe_id, zone_id, status, deleted_at is not null as deleted from items where user_id=$1`, [f.user.id])).rows).toEqual([{ wardrobe_id: target.id, zone_id: destination.id, status: "draft", deleted: true }]);
  expect(await f.repository.list(f.other.id)).toEqual([f.foreign]);
});
