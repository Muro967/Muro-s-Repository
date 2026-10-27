// @vitest-environment node

import { inspirationFixture } from "../../helpers/inspiration-fixture";

vi.mock("server-only", () => ({}));

let f: Awaited<ReturnType<typeof inspirationFixture>>;

beforeEach(async () => {
  f = await inspirationFixture();
});

afterEach(async () => {
  await f.client.close();
});

test("creates, lists, reads and updates only owned inspirations", async () => {
  const upload = await f.upload();
  const created = await f.service.create(f.user.id, {
    uploadId: upload.id,
    name: "通勤参考",
    colorNames: ["灰绿"],
  });
  expect(created).toMatchObject({
    name: "通勤参考",
    colorNames: ["灰绿"],
    imageUrl: `/api/inspirations/${created.id}/image`,
    version: 1,
  });
  expect(created).not.toHaveProperty("userId");
  expect(created).not.toHaveProperty("uploadId");
  expect(created).not.toHaveProperty("objectKey");
  await expect(f.service.read(f.other.id, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await f.service.list(f.other.id)).toEqual([]);

  const updated = await f.service.update(f.user.id, created.id, {
    expectedVersion: 1,
    styleTags: ["极简"],
    confirmedFields: ["styleTags"],
  });
  expect(updated).toMatchObject({ styleTags: ["极简"], confirmedFields: ["styleTags"], version: 2 });
  await expect(f.service.update(f.user.id, created.id, {
    expectedVersion: 1,
    name: "过期写入",
  })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});

test("rejects foreign, pending and wardrobe uploads without exposing which one exists", async () => {
  for (const options of [
    { userId: f.other.id },
    { status: "pending" as const },
    { kind: "wardrobe-original" as const },
  ]) {
    const upload = await f.upload(undefined, options);
    await expect(f.service.create(f.user.id, { uploadId: upload.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});

test("binds one upload once and serializes competing claims", async () => {
  const upload = await f.upload();
  const results = await Promise.allSettled([
    f.service.create(f.user.id, { uploadId: upload.id, name: "A" }),
    f.service.create(f.user.id, { uploadId: upload.id, name: "B" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "ASSET_CONFLICT" },
  });
});

test("soft delete is idempotent, hides records and retains the image binding", async () => {
  const upload = await f.upload();
  const created = await f.service.create(f.user.id, { uploadId: upload.id, styleTags: ["法式"] });
  await f.service.remove(f.user.id, created.id, { expectedVersion: 1 });
  await f.service.remove(f.user.id, created.id, { expectedVersion: 1 });
  expect(await f.service.list(f.user.id)).toEqual([]);
  await expect(f.service.read(f.user.id, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(f.service.findPrivateImage(f.user.id, created.id)).resolves.toBeNull();
  expect((await f.client.query(
    "select upload_id, deleted_at is not null as deleted from inspirations where id = $1",
    [created.id],
  )).rows).toEqual([{ upload_id: upload.id, deleted: true }]);
});

test("orders newest first with a stable id tie-break and excludes deleted rows", async () => {
  const firstUpload = await f.upload();
  const secondUpload = await f.upload();
  const first = await f.service.create(f.user.id, { uploadId: firstUpload.id, name: "First" });
  const second = await f.service.create(f.user.id, { uploadId: secondUpload.id, name: "Second" });
  await f.client.query(
    "update inspirations set created_at = '2026-10-19T00:00:00Z' where id in ($1, $2)",
    [first.id, second.id],
  );
  const expected = [first, second].sort((a, b) => b.id.localeCompare(a.id)).map(({ id }) => id);
  expect((await f.service.list(f.user.id)).map(({ id }) => id)).toEqual(expected);
});

test("rechecks upload metadata inside the create transaction", async () => {
  const upload = await f.upload();
  const originalCreate = f.repository.create.bind(f.repository);
  f.repository.create = async (...parameters) => {
    await f.client.query("update uploads set status = 'pending', completed_at = null where id = $1", [upload.id]);
    return originalCreate(...parameters);
  };
  await expect(f.service.create(f.user.id, { uploadId: upload.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await f.client.query("select count(*)::int as count from inspirations")).rows).toEqual([{ count: 0 }]);
});
