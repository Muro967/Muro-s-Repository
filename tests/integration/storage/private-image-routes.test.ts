// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createPrivateImageHandler } from "@/features/storage/private-image-routes";
import { itemFixture } from "../../helpers/item-fixture";
import { token } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({ getProductionAuthRouteDependencies: () => ({ appUrl: f.appUrl, repository: f.authRepository, now: f.now }) }));
vi.mock("@/server/db/client", () => ({ getDb: () => f.database }));
vi.mock("@/server/storage", () => ({ createStorageProvider: () => f.provider }));
let f: Awaited<ReturnType<typeof itemFixture>>;
beforeEach(async () => { f = await itemFixture(); });
afterEach(async () => { await f.client.close(); });
function request(signedIn = true) { return new Request("http://localhost:3000/api/items/image", { headers: signedIn ? { cookie: `aiw_session=${token}` } : {} }); }

test("streams exact owned bytes without origin, keys or caching, including recoverable and disposed items", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const upload = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, upload.id);
  await f.service.activateItem(f.user.id, item.id);
  const assetId = (await f.service.readItem(f.user.id, item.id)).original!.id;
  const { GET } = await import("@/app/api/items/[itemId]/assets/[assetId]/content/route");
  for (const update of ["status='active'", "deleted_at=now()", "status='disposed', deleted_at=null"]) {
    await f.client.exec(`update items set ${update} where id='${item.id}'`);
    const response = await GET(request(), { params: Promise.resolve({ itemId: item.id, assetId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...response.headers.values()].join(" ")).not.toContain(upload.objectKey);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(upload.data);
  }
});

test("returns indistinguishable 404s for anonymous foreign unknown unbound incomplete and wrong-kind relationships", async () => {
  const item = await f.service.createDraft(f.user.id, f.complete);
  const other = await f.service.createDraft(f.other.id, {});
  const foreignUpload = await f.upload(undefined, { userId: f.other.id });
  await f.service.attachOriginal(f.other.id, other.id, foreignUpload.id);
  const foreignAssetId = (await f.service.readItem(f.other.id, other.id)).original!.id;
  const upload = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, upload.id);
  const assetId = (await f.service.readItem(f.user.id, item.id)).original!.id;
  const get = createPrivateImageHandler(f);
  const reference = await (await get(request(false), item.id, assetId)).text();
  for (const [itemId, id] of [[other.id, foreignAssetId], [item.id, foreignAssetId], [other.id, assetId], [item.id, randomUUID()], [randomUUID(), assetId], [item.id, upload.id], ["bad", assetId]]) {
    const response = await get(request(), itemId, id);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(reference);
  }
  for (const update of ["status='pending'", "status='completed', completed_at=null", "completed_at=now(), kind='inspiration'"]) {
    await f.client.exec(`update uploads set ${update} where id='${upload.id}'`);
    const response = await get(request(), item.id, assetId);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(reference);
  }
});
