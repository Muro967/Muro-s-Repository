// @vitest-environment node
import { createWardrobeService } from "@/features/wardrobe/wardrobe-service";
import { wardrobeFixture } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));

test("normalizes visible names and rejects invalid names, kinds and unknown fields before persisting", async () => {
  const f = await wardrobeFixture();
  try {
    const service = createWardrobeService(f.repository);
    const created = await service.createWardrobe(f.user.id, { name: "  客厅柜  " });
    expect(created.name).toBe("客厅柜");
    for (const input of [{ name: " \t\n " }, { name: "\u200b\u200d" }, { name: "x".repeat(81) }, { name: "X", userId: f.other.id }]) {
      await expect(service.createWardrobe(f.user.id, input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(service.createZone(f.user.id, created.id, { name: "鞋", kind: "box" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect((await service.list(f.user.id)).map((w) => w.name)).toEqual(["我的衣柜", "客厅柜"]);
  } finally { await f.client.close(); }
});

test("rejects malformed identifiers and strict delete/reorder payloads", async () => {
  const f = await wardrobeFixture();
  try {
    const service = createWardrobeService(f.repository);
    await expect(service.renameWardrobe(f.user.id, "bad", { name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.deleteZone(f.user.id, f.source.zones[0]!.id, { destinationZoneId: "bad" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(service.reorderWardrobes(f.user.id, { orderedIds: [f.source.id], extra: true })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  } finally { await f.client.close(); }
});
