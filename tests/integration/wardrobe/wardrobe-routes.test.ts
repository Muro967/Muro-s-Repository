// @vitest-environment node
import { createWardrobeHandlers } from "@/features/wardrobe/wardrobe-routes";
import { jsonRequest } from "../../helpers/http-request";
import { token, wardrobeFixture } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({ getProductionAuthRouteDependencies: () => ({ appUrl: f.appUrl, repository: f.authRepository, now: f.now }) }));
vi.mock("@/server/db/client", () => ({ getDb: () => f.database }));
let f: Awaited<ReturnType<typeof wardrobeFixture>>;
beforeEach(async () => { f = await wardrobeFixture(); });
afterEach(async () => { await f.client.close(); });
function request(body?: unknown, cookie = true) {
  const req = jsonRequest("/api/wardrobes", body);
  if (cookie) req.headers.set("cookie", `aiw_session=${token}`);
  return req;
}

test("authenticates list and mutations and checks write origin before body parsing", async () => {
  const h = createWardrobeHandlers(f);
  expect((await h.list(request(undefined, false))).status).toBe(401);
  expect((await h.createWardrobe(request({ name: "X" }, false))).status).toBe(401);
  const crossOrigin = request({ name: "X" });
  crossOrigin.headers.set("origin", "https://attacker.example");
  expect((await h.createWardrobe(crossOrigin)).status).toBe(403);
  expect(crossOrigin.bodyUsed).toBe(false);
  const response = await h.list(request());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).wardrobes.map((w: { id: string }) => w.id)).toEqual([f.source.id]);
});

test("exposes strict owned create rename reorder delete flows and safe error codes", async () => {
  const h = createWardrobeHandlers(f);
  expect((await h.createWardrobe(request({ name: "X", userId: f.other.id }))).status).toBe(400);
  const response = await h.createWardrobe(request({ name: "  Extra  " }));
  expect(response.status).toBe(201);
  const { wardrobe } = await response.json();
  expect(wardrobe).toMatchObject({ name: "Extra", zones: [] });
  expect((await h.renameWardrobe(request({ name: "Renamed" }), wardrobe.id)).status).toBe(200);
  expect((await h.reorderWardrobes(request({ orderedIds: [wardrobe.id, f.source.id] }))).status).toBe(200);
  const zoneResponse = await h.createZone(request({ name: "Drawer", kind: "drawer" }), wardrobe.id);
  expect(zoneResponse.status).toBe(201);
  const { zone } = await zoneResponse.json();
  expect((await h.renameZone(request({ name: "Socks" }), zone.id)).status).toBe(200);
  expect((await h.reorderZones(request({ orderedIds: [zone.id] }), wardrobe.id)).status).toBe(200);
  expect((await h.deleteZone(request({}), zone.id)).status).toBe(200);
  expect((await h.deleteWardrobe(request({}), wardrobe.id)).status).toBe(200);
  const foreign = await h.renameWardrobe(request({ name: "X" }), f.foreign.id);
  expect(foreign.status).toBe(404);
  expect((await foreign.json()).error.code).toBe("NOT_FOUND");
  const final = await h.deleteWardrobe(request({}), f.source.id);
  expect(final.status).toBe(409);
  expect((await final.json()).error.code).toBe("LAST_WARDROBE");
});

test("maps relocation conflicts and failures without leaking persistence details", async () => {
  const h = createWardrobeHandlers(f);
  await f.client.query(`insert into items (user_id, wardrobe_id, zone_id) values ($1,$2,$3)`, [f.user.id, f.source.id, f.source.zones[0]!.id]);
  const response = await h.deleteZone(request({}), f.source.zones[0]!.id);
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("LOCATION_REQUIRED");
  await f.client.exec("alter table wardrobes add constraint reject_name check (name <> 'rejected')");
  const failed = await h.createWardrobe(request({ name: "rejected" }));
  expect(failed.status).toBe(500);
  expect(await failed.text()).not.toContain("reject_name");
});

test("binds the exported Next routes to real owned CRUD using asynchronous route params", async () => {
  const root = await import("@/app/api/wardrobes/route");
  const wardrobeRoute = await import("@/app/api/wardrobes/[wardrobeId]/route");
  const wardrobeOrder = await import("@/app/api/wardrobes/reorder/route");
  const zoneRoot = await import("@/app/api/wardrobes/[wardrobeId]/zones/route");
  const zoneOrder = await import("@/app/api/wardrobes/[wardrobeId]/zones/reorder/route");
  const zoneRoute = await import("@/app/api/zones/[zoneId]/route");
  const { wardrobe } = await (await root.POST(request({ name: "Route wardrobe" }))).json();
  const context = { params: Promise.resolve({ wardrobeId: wardrobe.id }) };
  expect((await wardrobeRoute.PATCH(request({ name: "Bound rename" }), context)).status).toBe(200);
  const { zone } = await (await zoneRoot.POST(request({ name: "Bound zone", kind: "shelf" }), context)).json();
  const zoneContext = { params: Promise.resolve({ zoneId: zone.id }) };
  expect((await zoneRoute.PATCH(request({ name: "Bound zone rename" }), zoneContext)).status).toBe(200);
  expect((await wardrobeOrder.POST(request({ orderedIds: [wardrobe.id, f.source.id] }))).status).toBe(200);
  expect((await zoneOrder.POST(request({ orderedIds: [zone.id] }), context)).status).toBe(200);
  const listed = await (await root.GET(request())).json();
  expect(listed.wardrobes[0]).toMatchObject({ id: wardrobe.id, name: "Bound rename", sortOrder: 0, zones: [{ id: zone.id, name: "Bound zone rename", kind: "shelf", sortOrder: 0 }] });
  expect((await zoneRoute.DELETE(request({}), zoneContext)).status).toBe(200);
  expect((await wardrobeRoute.DELETE(request({}), context)).status).toBe(200);
  const malformedId = await zoneRoute.PATCH(request({ name: "X" }), { params: Promise.resolve({ zoneId: "bad-id" }) });
  expect(malformedId.status).toBe(404);
});
