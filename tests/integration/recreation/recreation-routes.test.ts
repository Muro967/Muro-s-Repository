// @vitest-environment node

import { randomUUID } from "node:crypto";

import { createRecreationHandlers } from "@/features/recreation/recreation-routes";
import { DrizzleRecreationRepository } from "@/server/db/drizzle-recreation-repository";
import { items } from "@/server/db/schema";
import { inspirationFixture } from "../../helpers/inspiration-fixture";
import { jsonRequest } from "../../helpers/http-request";
import { token } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));

let f: Awaited<ReturnType<typeof inspirationFixture>>;

beforeEach(async () => {
  f = await inspirationFixture();
});

afterEach(async () => {
  await f.client.close();
});

function signed(path: string, body?: unknown) {
  const request = jsonRequest(path, body);
  request.headers.set("cookie", `aiw_session=${token}`);
  return request;
}

test("creates and reads a tenant-scoped rule recreation from active wardrobe items", async () => {
  const upload = await f.upload();
  const inspiration = await f.service.create(f.user.id, {
    uploadId: upload.id,
    colorNames: ["米白", "黑色"],
    styleTags: ["极简"],
    keyItems: ["衬衫", "阔腿裤"],
    formality: "通勤",
  });
  const top = randomUUID();
  const bottom = randomUUID();
  await f.database.insert(items).values([
    { id: top, userId: f.user.id, wardrobeId: f.source.id, zoneId: f.source.zones[0]!.id, name: "米白衬衫", categoryId: "tops", colorNames: ["米白"], styleIds: ["minimalist"], formality: "通勤", status: "active", addedOn: "2026-10-19" },
    { id: bottom, userId: f.user.id, wardrobeId: f.source.id, zoneId: f.source.zones[0]!.id, name: "黑色阔腿裤", categoryId: "bottoms", colorNames: ["黑色"], styleIds: ["minimalist"], fit: "宽松", status: "active", addedOn: "2026-10-19" },
    { id: randomUUID(), userId: f.user.id, name: "亮红草稿", categoryId: "tops", colorNames: ["亮红"], status: "draft" },
    { id: randomUUID(), userId: f.other.id, wardrobeId: f.foreign.id, zoneId: f.foreign.zones[0]!.id, name: "其他用户鞋", categoryId: "shoes", status: "active", addedOn: "2026-10-19" },
  ]);
  const handlers = createRecreationHandlers({ appUrl: f.appUrl, authRepository: f.authRepository, now: f.now, repository: new DrizzleRecreationRepository(f.database) });
  const created = await handlers.create(signed(`/api/inspirations/${inspiration.id}/recreations`, {}), inspiration.id);
  expect(created.status).toBe(201);
  const recreation = (await created.json()).recreation;
  expect(recreation.items.map((entry: { itemId: string }) => entry.itemId)).toEqual([top, bottom]);
  expect(recreation.missing).toEqual(["鞋履"]);

  const read = await handlers.read(signed(`/api/recreations/${recreation.id}`), recreation.id);
  expect(read.status).toBe(200);
  expect((await read.json()).recreation).toMatchObject({ id: recreation.id, inspirationId: inspiration.id });
  expect((await handlers.read(signed("/api/recreations/00000000-0000-4000-8000-000000000099"), "00000000-0000-4000-8000-000000000099")).status).toBe(404);
});

test("requires authentication and same-origin writes", async () => {
  const handlers = createRecreationHandlers({ appUrl: f.appUrl, authRepository: f.authRepository, now: f.now, repository: new DrizzleRecreationRepository(f.database) });
  const id = "10000000-0000-4000-8000-000000000001";
  expect((await handlers.create(jsonRequest(`/api/inspirations/${id}/recreations`, {}), id)).status).toBe(401);
  const denied = signed(`/api/inspirations/${id}/recreations`, {});
  denied.headers.delete("origin");
  expect((await handlers.create(denied, id)).status).toBe(403);
  expect(denied.bodyUsed).toBe(false);
});
