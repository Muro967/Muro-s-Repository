// @vitest-environment node
import { createItemHandlers } from "@/features/items/item-routes";
import { jsonRequest } from "../../helpers/http-request";
import { itemFixture } from "../../helpers/item-fixture";
import { token } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({ getProductionAuthRouteDependencies: () => ({ appUrl: f.appUrl, repository: f.authRepository, now: f.now }) }));
vi.mock("@/server/db/client", () => ({ getDb: () => f.database }));
vi.mock("@/server/storage", () => ({ createStorageProvider: () => f.provider }));
let f: Awaited<ReturnType<typeof itemFixture>>;
beforeEach(async () => { f = await itemFixture(); });
afterEach(async () => { await f.client.close(); });
function request(body?: unknown, signedIn = true) {
  const req = jsonRequest("/api/items", body);
  if (signedIn) req.headers.set("cookie", `aiw_session=${token}`);
  return req;
}

test("checks mutation origins before parsing, authenticates and rejects strict controlled fields", async () => {
  const h = createItemHandlers(f);
  const item = await f.service.createDraft(f.user.id, {});
  for (const [action, body] of [[h.create, {}], [h.update, {}], [h.activate, {}], [h.attach, { uploadId: "bad" }]] as const) {
    const req = request(body);
    req.headers.delete("origin");
    expect((await action(req, item.id)).status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect((await action(request(body, false), item.id)).status).toBe(401);
  }
  expect((await h.read(request(undefined, false), item.id)).status).toBe(401);
  expect((await h.create(request({ status: "active" }))).status).toBe(400);
  expect((await h.update(request({ addedOn: "2026-01-01" }), item.id)).status).toBe(400);
  expect((await h.activate(request({ force: true }), item.id)).status).toBe(400);
  expect((await h.attach(request({ uploadId: "bad", role: "original" }), item.id)).status).toBe(400);
  expect((await h.activate(request({}), item.id)).status).toBe(409);
  expect((await h.read(request(), "bad")).status).toBe(404);
});

test("binds real Next handlers with async params and returns safe owned details", async () => {
  const root = await import("@/app/api/items/route");
  const route = await import("@/app/api/items/[itemId]/route");
  const activate = await import("@/app/api/items/[itemId]/activate/route");
  const attach = await import("@/app/api/items/[itemId]/original/route");
  const response = await root.POST(request({}));
  expect(response.status).toBe(201);
  const { item } = await response.json();
  const context = { params: Promise.resolve({ itemId: item.id }) };
  expect((await route.PATCH(request(f.complete), context)).status).toBe(200);
  const upload = await f.upload();
  expect((await attach.PUT(request({ uploadId: upload.id }), context)).status).toBe(200);
  const activated = await activate.POST(request({}), context);
  expect(activated.status).toBe(200);
  expect((await activated.json()).item).toMatchObject({ status: "active", addedOn: "2026-10-19" });
  const read = request(); read.headers.delete("origin");
  const detail = await route.GET(read, context);
  expect(detail.status).toBe(200);
  const text = await detail.text();
  expect(text).not.toContain(upload.objectKey);
  expect(text).not.toContain("userId");
  const foreign = await f.service.createDraft(f.other.id, {});
  expect((await route.GET(request(), { params: Promise.resolve({ itemId: foreign.id }) })).status).toBe(404);
  await f.client.exec("alter table items add constraint reject_name check (name <> 'secret-db-error')");
  const failure = await root.POST(request({ name: "secret-db-error" }));
  expect(failure.status).toBe(500);
  expect(await failure.text()).not.toContain("secret-db-error");
});
