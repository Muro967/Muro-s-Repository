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

test("resolves PATCH local dates after request guards and refreshes them per request", async () => {
  const todayForUser = vi.fn().mockResolvedValueOnce("2026-10-20").mockResolvedValue("2026-10-19");
  const h = createItemHandlers({ ...f, todayForUser });
  const item = await f.service.createDraft(f.user.id, {});
  const denied = request({}, false);
  denied.headers.delete("origin");
  expect((await h.update(denied, "bad-id")).status).toBe(403);
  expect(denied.bodyUsed).toBe(false);
  const unsigned = request({}, false);
  expect((await h.update(unsigned, "bad-id")).status).toBe(401);
  expect(unsigned.bodyUsed).toBe(false);
  const malformedBody = new Request(request({}), { body: "{" });
  expect((await h.update(malformedBody, "bad-id")).status).toBe(400);
  expect((await h.update(request({ status: "active" }), "bad-id")).status).toBe(404);
  expect(todayForUser).not.toHaveBeenCalled();

  expect((await h.update(request({ manualLastWornOn: "2026-10-20" }), item.id)).status).toBe(200);
  expect((await h.update(request({ manualLastWornOn: "2026-10-20" }), item.id)).status).toBe(400);
  expect(todayForUser).toHaveBeenCalledTimes(2);
  expect(todayForUser).toHaveBeenNthCalledWith(1, f.user.id, f.now());
  expect(todayForUser).toHaveBeenNthCalledWith(2, f.user.id, f.now());

  const foreign = await f.service.createDraft(f.other.id, {});
  expect((await h.update(request({ status: "active" }), foreign.id)).status).toBe(400);
  expect((await h.update(request({ manualLastWornOn: "2026-10-19" }), foreign.id)).status).toBe(404);
});

test.each([
  ["Asia/Shanghai", "2026-10-19T18:00:00Z", "2026-10-20", "2026-10-21"],
  ["America/Los_Angeles", "2026-10-20T00:30:00Z", "2026-10-19", "2026-10-20"],
])("validates PATCH manual last-worn against the watching user's local today in %s", async (timeZone, instant, localToday, localTomorrow) => {
  f.now = () => new Date(instant);
  await f.client.query(`update user_settings set time_zone=$1 where user_id=$2`, [timeZone, f.user.id]);
  const item = await f.service.createDraft(f.user.id, f.complete);
  const upload = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, upload.id);
  await f.service.activateItem(f.user.id, item.id);
  await f.client.query(`update items set added_on='2026-01-01' where user_id=$1 and id=$2`, [f.user.id, item.id]);
  const watch = await import("@/app/api/items/[itemId]/watch/route");
  const route = await import("@/app/api/items/[itemId]/route");
  const context = { params: Promise.resolve({ itemId: item.id }) };
  const watching = await watch.POST(request({}), context);
  expect(watching.status).toBe(200);
  expect((await watching.json()).item.watchStartedOn).toBe(localToday);
  const future = await route.PATCH(request({ manualLastWornOn: localTomorrow }), context);
  expect(future.status).toBe(400);
  expect(await f.repository.findItem(f.user.id, item.id)).toMatchObject({ status: "watching", watchStartedOn: localToday, manualLastWornOn: null });
  const worn = await route.PATCH(request({ manualLastWornOn: localToday }), context);
  expect(worn.status).toBe(200);
  expect((await worn.json()).item).toMatchObject({ status: "active", manualLastWornOn: localToday, watchStartedOn: null, watchDueOn: null });
  const foreign = await f.service.createDraft(f.other.id, {});
  expect((await route.PATCH(request({ manualLastWornOn: localToday }), { params: Promise.resolve({ itemId: foreign.id }) })).status).toBe(404);
  expect((await route.PATCH(request({ manualLastWornOn: localToday }), { params: Promise.resolve({ itemId: "bad-id" }) })).status).toBe(404);
});

test.each([
  ["Asia/Shanghai", "2026-10-19T18:00:00Z", "2026-10-20", "2026-10-21"],
  ["America/Los_Angeles", "2026-10-20T00:30:00Z", "2026-10-19", "2026-10-20"],
])("creates and activates using the saved local date in %s", async (timeZone, instant, localToday, localTomorrow) => {
  f.now = () => new Date(instant);
  await f.client.query(`update user_settings set time_zone=$1 where user_id=$2`, [timeZone, f.user.id]);
  const root = await import("@/app/api/items/route");
  const activate = await import("@/app/api/items/[itemId]/activate/route");
  expect((await root.POST(request({ manualLastWornOn: localTomorrow }))).status).toBe(400);
  const created = await root.POST(request({ ...f.complete, manualLastWornOn: localToday }));
  expect(created.status).toBe(201);
  const { item } = await created.json();
  expect(item.manualLastWornOn).toBe(localToday);
  const upload = await f.upload();
  await f.service.attachOriginal(f.user.id, item.id, upload.id);
  const context = { params: Promise.resolve({ itemId: item.id }) };
  const response = await activate.POST(request({}), context);
  expect(response.status).toBe(200);
  expect((await response.json()).item.addedOn).toBe(localToday);
});

test("activation captures a fresh local date on each command and never rewrites the first admission date", async () => {
  let localToday = "2026-10-20";
  const h = createItemHandlers({ ...f, todayForUser: async () => localToday });
  const item = await f.service.createDraft(f.user.id, f.complete);
  const upload = await f.upload(); await f.service.attachOriginal(f.user.id, item.id, upload.id);
  expect((await h.activate(request({}), item.id)).status).toBe(200);
  expect(await f.repository.findItem(f.user.id, item.id)).toMatchObject({ addedOn: "2026-10-20" });
  localToday = "2026-10-21";
  const second = await f.service.createDraft(f.user.id, f.complete);
  const secondUpload = await f.upload(); await f.service.attachOriginal(f.user.id, second.id, secondUpload.id);
  expect((await h.activate(request({}), second.id)).status).toBe(200);
  expect(await f.repository.findItem(f.user.id, second.id)).toMatchObject({ addedOn: "2026-10-21" });
  expect((await h.activate(request({}), item.id)).status).toBe(200);
  expect(await f.repository.findItem(f.user.id, item.id)).toMatchObject({ addedOn: "2026-10-20" });
});

test("create and activation refresh local dates per request while retaining command guard precedence", async () => {
  let localToday = "2026-10-19";
  const todayForUser = vi.fn(async () => localToday);
  const h = createItemHandlers({ ...f, todayForUser });
  for (const action of [h.create, h.activate]) {
    const denied = request({}, false); denied.headers.delete("origin");
    expect((await action(denied, "bad-id")).status).toBe(403);
    expect(denied.bodyUsed).toBe(false);
    const unsigned = request({}, false);
    expect((await action(unsigned, "bad-id")).status).toBe(401);
    expect(unsigned.bodyUsed).toBe(false);
    expect((await action(new Request(request({}), { body: "{" }), "bad-id")).status).toBe(400);
  }
  expect((await h.activate(request({ force: true }), "bad-id")).status).toBe(400);
  expect((await h.activate(request({}), "bad-id")).status).toBe(404);
  expect(todayForUser).not.toHaveBeenCalled();
  expect((await h.create(request({ manualLastWornOn: "2026-10-20" }))).status).toBe(400);
  localToday = "2026-10-20";
  expect((await h.create(request({ manualLastWornOn: "2026-10-20" }))).status).toBe(201);
  const item = await f.service.createDraft(f.user.id, f.complete);
  const upload = await f.upload(); await f.service.attachOriginal(f.user.id, item.id, upload.id);
  expect((await h.activate(request({}), item.id)).status).toBe(200);
  expect(await f.repository.findItem(f.user.id, item.id)).toMatchObject({ addedOn: "2026-10-20" });
  localToday = "2026-10-21";
  expect((await h.activate(request({}), item.id)).status).toBe(200);
  expect(await f.repository.findItem(f.user.id, item.id)).toMatchObject({ addedOn: "2026-10-20" });
  const foreign = await f.service.createDraft(f.other.id, {});
  expect((await h.activate(request({ force: true }), foreign.id)).status).toBe(400);
  expect((await h.activate(request({}), foreign.id)).status).toBe(404);
  expect((await h.activate(request({}), "b3702bc6-e5de-45b6-92b6-1e9f8e23b139")).status).toBe(404);
});
