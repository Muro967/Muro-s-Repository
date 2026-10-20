// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createIdleHandlers } from "@/features/idle/idle-routes";
import { idleFixture } from "../../helpers/idle-fixture";
import { jsonRequest } from "../../helpers/http-request";
import { token } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({ getProductionAuthRouteDependencies: () => ({ appUrl: f.appUrl, repository: f.authRepository, now: f.now }) }));
vi.mock("@/server/db/client", () => ({ getDb: () => f.database }));
let f: Awaited<ReturnType<typeof idleFixture>>;
beforeEach(async () => { f = await idleFixture(); });
afterEach(async () => { await f.client.close(); });
function request(body?: unknown, cookie = true) {
  const req = jsonRequest("/api/idle", body);
  if (cookie) req.headers.set("cookie", `aiw_session=${token}`);
  return req;
}
test("authenticates every endpoint and rejects mutation origins before parsing", async () => {
  const h = createIdleHandlers(f);
  for (const action of [h.readIdleDashboard, h.readIdleSettings]) expect((await action(request(undefined, false))).status).toBe(401);
  for (const action of [h.startWatching, h.cancelWatching, h.disposeItem, h.updateIdleSettings]) {
    expect((await action(request({}, false), randomUUID())).status).toBe(401);
    const cross = request({}); cross.headers.set("origin", "https://attacker.example");
    expect((await action(cross, randomUUID())).status).toBe(403);
    expect(cross.bodyUsed).toBe(false);
  }
});
test("returns uniform 404 for foreign, absent and malformed item ids and strict 400 bodies", async () => {
  const h = createIdleHandlers(f);
  const foreign = await f.item({ userId: f.other.id });
  for (const action of [h.startWatching, h.cancelWatching, h.disposeItem]) {
    const responses = [];
    for (const id of [foreign, randomUUID(), "bad-id"]) {
      const response = await action(request(action === h.disposeItem ? { method: "donated", disposedOn: "2026-10-19" } : {}), id);
      expect(response.status).toBe(404); responses.push(await response.json());
    }
    expect(responses[0]).toEqual(responses[1]); expect(responses[1]).toEqual(responses[2]);
  }
  const id = await f.item();
  expect((await h.startWatching(request({ userId: f.other.id }), id)).status).toBe(400);
  expect((await h.cancelWatching(request({ status: "active" }), id)).status).toBe(400);
  expect((await h.disposeItem(request({ method: "donated", disposedOn: "2026-10-20" }), id)).status).toBe(400);
  expect((await h.updateIdleSettings(request({ watchDays: "30" }))).status).toBe(400);
});
test("binds real exported routes, maps conflicts and hides persistence errors", async () => {
  const root = await import("@/app/api/idle/route");
  const watch = await import("@/app/api/items/[itemId]/watch/route");
  const disposal = await import("@/app/api/items/[itemId]/disposal/route");
  const settings = await import("@/app/api/settings/idle/route");
  const id = await f.item(); const context = { params: Promise.resolve({ itemId: id }) };
  expect((await watch.POST(request({}), context)).status).toBe(200);
  expect((await watch.DELETE(request({}), context)).status).toBe(200);
  expect((await settings.PATCH(request({ watchDays: 20 }))).status).toBe(200);
  expect((await (await settings.GET(request())).json()).settings.watchDays).toBe(20);
  expect((await disposal.POST(request({ method: "donated", disposedOn: "2026-10-19" }), context)).status).toBe(200);
  expect((await watch.POST(request({}), context)).status).toBe(409);
  const response = await root.GET(request());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).statistics.disposedCount).toBe(1);
  await f.client.exec(`alter table user_settings add constraint reject_idle_setting check (idle_days <> 99)`);
  const failed = await settings.PATCH(request({ idleDays: 99 }));
  expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("reject_idle_setting");
});

test("accepts absent empty-command bodies while rejecting malformed provided JSON", async () => {
  const h = createIdleHandlers(f);
  const id = await f.item();
  expect((await h.startWatching(request(), id)).status).toBe(200);
  expect((await h.cancelWatching(request(), id)).status).toBe(200);
  for (const action of [h.startWatching, h.cancelWatching, h.disposeItem, h.updateIdleSettings]) {
    const malformed = new Request("http://localhost:3000/api/idle", { method: "POST", headers: { origin: f.appUrl, host: "localhost:3000", "content-type": "application/json", cookie: `aiw_session=${token}` }, body: "{" });
    expect((await action(malformed, id)).status).toBe(400);
  }
});
