// @vitest-environment node
import sharp from "sharp";
import { createItemService } from "@/features/items/item-service";
import { itemFixture } from "../../helpers/item-fixture";
import { animatedPng, pngChunk, staticPngWithMarker } from "../../helpers/png-fixtures";

vi.mock("server-only", () => ({}));
let f: Awaited<ReturnType<typeof itemFixture>>;
beforeEach(async () => { f = await itemFixture(); });
afterEach(async () => { await f.client.close(); });

test("keeps incomplete drafts and activates once only after owned metadata and a verified original", async () => {
  const draft = await f.service.createDraft(f.user.id, {});
  expect(draft).toMatchObject({ name: "", status: "draft", addedOn: null, wardrobeId: null, zoneId: null });
  await expect(f.service.activateItem(f.user.id, draft.id)).rejects.toMatchObject({ code: "ITEM_INCOMPLETE" });
  await f.service.updateItem(f.user.id, draft.id, f.complete);
  await expect(f.service.activateItem(f.user.id, draft.id)).rejects.toMatchObject({ code: "ITEM_INCOMPLETE" });
  const upload = await f.upload();
  await f.service.attachOriginal(f.user.id, draft.id, upload.id);
  expect(await f.service.activateItem(f.user.id, draft.id)).toMatchObject({ status: "active", addedOn: "2026-10-19" });
  const nextDay = createItemService({ ...f, today: () => "2026-10-20" });
  expect(await nextDay.activateItem(f.user.id, draft.id)).toMatchObject({ status: "active", addedOn: "2026-10-19" });
  expect(await nextDay.updateItem(f.user.id, draft.id, { manualLastWornOn: "2026-10-20" })).toMatchObject({ manualLastWornOn: "2026-10-20" });
  await expect(f.service.updateItem(f.user.id, draft.id, { zoneId: null })).rejects.toMatchObject({ code: "ITEM_INCOMPLETE" });
  expect(await f.service.readItem(f.user.id, draft.id)).toMatchObject({ zoneId: f.complete.zoneId });
});

test("validates strict bounded editable fields with normalized colors and injected real dates", async () => {
  const item = await f.service.createDraft(f.user.id, { name: "  🧥  ", colorNames: [" Red "], colorHexes: ["#aabbcc"], styleIds: ["minimalist"], manualLastWornOn: "2026-10-19" });
  expect(item).toMatchObject({ name: "🧥", colorNames: ["Red"], colorHexes: ["#AABBCC"], manualLastWornOn: "2026-10-19" });
  for (const input of [{ name: "🧥".repeat(81) }, { notes: "x".repeat(1001) }, { brand: "x".repeat(81) }, { colorNames: ["a", " a "] }, { colorHexes: ["#AABBCC", "#aabbcc"] }, { styleIds: ["unknown"] }, { seasonIds: ["summer", "summer"] }, { manualLastWornOn: "2026-02-30" }, { manualLastWornOn: "2026-10-20" }, ...["userId", "status", "addedOn", "watchStartedOn", "watchDueOn", "deletedAt", "disposal", "materialId", "occasionIds", "purchasedOn", "lastWornOn"].map((key) => ({ [key]: null }))]) {
    await expect(f.service.createDraft(f.user.id, input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(f.service.updateItem(f.user.id, item.id, input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  expect(await f.service.updateItem(f.user.id, item.id, { brand: null, colorNames: [], wardrobeId: f.source.id })).toMatchObject({ brand: null, colorNames: [], zoneId: null });
});

test("validates merged location ownership and hides foreign item and upload identities", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  for (const input of [{ wardrobeId: null }, { wardrobeId: f.foreign.id }, { zoneId: f.foreign.zones[0]!.id }]) {
    await expect(f.service.updateItem(f.user.id, item.id, input)).rejects.toMatchObject({ code: input.wardrobeId === null ? "INVALID_INPUT" : "NOT_FOUND" });
  }
  for (const input of [{ zoneId: f.complete.zoneId }, { wardrobeId: f.foreign.id }]) await expect(f.service.createDraft(f.user.id, input)).rejects.toHaveProperty("code");
  await expect(f.service.readItem(f.other.id, item.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const options of [{ userId: f.other.id }, { kind: "inspiration" as const }, { status: "pending" }]) {
    const upload = await f.upload(undefined, options);
    await expect(f.service.attachOriginal(f.user.id, item.id, upload.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});

test("decodes actual pixels and rejects corrupt, mismatched, unsupported, animated and oversized images without replacing the original", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const original = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, original.id);
  const before = (await f.service.readItem(f.user.id, item.id)).original;
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const wide = await sharp({ create: { width: 12001, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  const bomb = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "red" } }).png().toBuffer();
  const animated = await sharp(Buffer.concat([Buffer.alloc(12), Buffer.alloc(12, 255)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0 }).toBuffer();
  for (const [bytes, contentType] of [[Buffer.from("bad"), "image/jpeg"], [original.data.subarray(0, original.data.length - 30), "image/jpeg"], [png, "image/jpeg"], [Buffer.from('<svg width="1" height="1"></svg>'), "image/png"], [wide, "image/png"], [bomb, "image/png"], [animated, "image/webp"]] as const) {
    const upload = await f.upload(bytes, { contentType });
    await expect(f.service.attachOriginal(f.user.id, item.id, upload.id)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect((await f.service.readItem(f.user.id, item.id)).original).toEqual(before);
    expect(f.provider.objects.has(original.objectKey)).toBe(true);
  }
});

test("binds idempotently, replaces atomically and serializes competing claims without deleting objects", async () => {
  const a = await f.service.createDraft(f.user.id, f.complete);
  const b = await f.service.createDraft(f.user.id, f.complete);
  const first = await f.upload();
  await f.service.attachOriginal(f.user.id, a.id, first.id);
  const original = (await f.service.readItem(f.user.id, a.id)).original;
  await f.service.attachOriginal(f.user.id, a.id, first.id);
  expect((await f.service.readItem(f.user.id, a.id)).original).toEqual(original);
  const next = await f.upload();
  const results = await Promise.allSettled([f.service.attachOriginal(f.user.id, a.id, next.id), f.service.attachOriginal(f.user.id, b.id, next.id)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "ASSET_CONFLICT" } });
  expect(f.provider.objects.size).toBe(2);
  await f.client.exec(`create function reject_asset_write() returns trigger language plpgsql as $$ begin raise exception 'injected-private-detail'; end $$; create trigger reject_write before insert or update on item_assets for each row execute function reject_asset_write()`);
  const before = (await f.service.readItem(f.user.id, a.id)).original;
  const third = await f.upload();
  await expect(f.service.attachOriginal(f.user.id, a.id, third.id)).rejects.toThrow("Item persistence failed");
  expect((await f.service.readItem(f.user.id, a.id)).original).toEqual(before);
  expect(f.provider.objects.size).toBe(3);
});

test("rejects real two-frame APNG despite sharp exposing only its first frame and preserves the original", async () => {
  const bytes = animatedPng();
  expect(await sharp(bytes, { animated: true }).metadata()).toMatchObject({ format: "png", width: 2, height: 2 });
  expect(await sharp(bytes, { animated: true }).raw().toBuffer()).toEqual(Buffer.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]));
  const item = await f.service.createDraft(f.user.id, f.complete);
  const original = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, original.id);
  const before = (await f.service.readItem(f.user.id, item.id)).original;
  const upload = await f.upload(bytes, { contentType: "image/png" });
  await expect(f.service.attachOriginal(f.user.id, item.id, upload.id)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  expect((await f.service.readItem(f.user.id, item.id)).original).toEqual(before);
  expect(f.provider.objects.get(original.objectKey)).toEqual(original.data);
});

test("accepts acTL bytes inside PNG pixel data while rejecting animation chunks anywhere in the stream", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const png = staticPngWithMarker();
  expect(png.includes(Buffer.from("acTL"))).toBe(true);
  const original = await f.upload(png, { contentType: "image/png" });
  await f.service.attachOriginal(f.user.id, item.id, original.id);
  const before = (await f.service.readItem(f.user.id, item.id)).original;
  const control = pngChunk("acTL", Buffer.from([0, 0, 0, 2, 0, 0, 0, 0]));
  for (const bytes of [Buffer.concat([png.subarray(0, 33), control, png.subarray(33)]), Buffer.concat([png.subarray(0, -12), control, png.subarray(-12)]), Buffer.concat([png, control])]) {
    const upload = await f.upload(bytes, { contentType: "image/png" });
    await expect(f.service.attachOriginal(f.user.id, item.id, upload.id)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect((await f.service.readItem(f.user.id, item.id)).original).toEqual(before);
  }
});

test("rejects PNG signature and chunk boundary corruption without replacing an original", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const original = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, original.id);
  const before = (await f.service.readItem(f.user.id, item.id)).original;
  const png = staticPngWithMarker();
  const signature = Buffer.from(png); signature[0] = 0;
  const oversized = Buffer.from(png); oversized.writeUInt32BE(0xffff_ffff, 33);
  for (const bytes of [signature, oversized, png.subarray(0, -1), Buffer.concat([png, Buffer.from([0, 0, 0])])]) {
    const upload = await f.upload(bytes, { contentType: "image/png" });
    await expect(f.service.attachOriginal(f.user.id, item.id, upload.id)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect((await f.service.readItem(f.user.id, item.id)).original).toEqual(before);
  }
});

test("accepts decoded PNG and WebP, replaces the binding and leaves the former object private", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const first = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, first.id);
  const former = (await f.service.readItem(f.user.id, item.id)).original!;
  for (const format of ["png", "webp"] as const) {
    const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "blue" } })[format]().toBuffer();
    const next = await f.upload(bytes, { contentType: `image/${format}` });
    await f.service.attachOriginal(f.user.id, item.id, next.id);
    expect((await f.service.readItem(f.user.id, item.id)).original).toMatchObject({ uploadId: next.id });
  }
  expect(await f.repository.findPrivateImage(f.user.id, item.id, former.id)).toBeNull();
  expect(f.provider.objects.get(first.objectKey)).toEqual(first.data);
  expect((await f.client.query("select id from item_assets where item_id=$1", [item.id])).rows).toHaveLength(1);
});

test("rechecks upload completion inside the binding transaction after decoding", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const first = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, first.id);
  const before = (await f.service.readItem(f.user.id, item.id)).original;
  const next = await f.upload();
  const open = f.provider.openObject.bind(f.provider);
  f.provider.openObject = async (key) => {
    await f.client.query("update uploads set status='pending', completed_at=null where id=$1", [next.id]);
    return open(key);
  };
  await expect(f.service.attachOriginal(f.user.id, item.id, next.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await f.service.readItem(f.user.id, item.id)).original).toEqual(before);
  expect(f.provider.objects.size).toBe(2);
});

test("serializes garment location writes with container deletion", async () => {
  const target = await f.wardrobeRepository.createZone(f.user.id, f.source.id, { name: "Target", kind: "shelf" });
  const item = await f.service.createDraft(f.user.id, f.complete);
  const results = await Promise.allSettled([
    f.wardrobeRepository.deleteZone(f.user.id, f.complete.zoneId, target.id),
    f.service.updateItem(f.user.id, item.id, { zoneId: f.complete.zoneId }),
  ]);
  expect(results[0]!.status).toBe("fulfilled");
  if (results[1]!.status === "rejected") expect(results[1]!.reason).toMatchObject({ code: "NOT_FOUND" });
  expect(await f.service.readItem(f.user.id, item.id)).toMatchObject({ zoneId: target.id });
});

test("keeps disposed and deleted items readable while rejecting every write", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const upload = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, upload.id);
  await f.service.activateItem(f.user.id, item.id);
  for (const change of ["status='disposed'", "status='active', deleted_at=now()"] ) {
    await f.client.exec(`update items set ${change} where id='${item.id}'`);
    expect(await f.service.readItem(f.user.id, item.id)).toMatchObject({ id: item.id });
    for (const action of [() => f.service.updateItem(f.user.id, item.id, {}), () => f.service.attachOriginal(f.user.id, item.id, upload.id), () => f.service.activateItem(f.user.id, item.id)]) await expect(action()).rejects.toMatchObject({ code: "ITEM_NOT_EDITABLE" });
  }
});
