import { wardrobeClient } from "@/features/wardrobe/wardrobe-client";
import { wardrobes } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

test("loads the real wardrobe tree and sends reorder and relocation payloads to their routes", async () => {
  const requests: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    requests.push({ path, init });
    return new Response(JSON.stringify(init?.method === "GET" ? { wardrobes } : { ok: true }), { status: 200 });
  });
  expect(await wardrobeClient.list()).toEqual({ ok: true, value: wardrobes });
  await wardrobeClient.reorderZones("w1", ["z2", "z1", "z3", "z4"]);
  await wardrobeClient.deleteZone("z1", "z5");
  expect(requests[0]).toMatchObject({ path: "/api/wardrobes", init: { credentials: "same-origin", cache: "no-store" } });
  expect(requests[1]).toMatchObject({ path: "/api/wardrobes/w1/zones/reorder", init: { method: "POST", body: '{"orderedIds":["z2","z1","z3","z4"]}' } });
  expect(requests[2]).toMatchObject({ path: "/api/zones/z1", init: { method: "DELETE", body: '{"destinationZoneId":"z5"}' } });
});

test.each(["LOCATION_REQUIRED", "LAST_WARDROBE", "UNAUTHORIZED", "NOT_FOUND", "INVALID_INPUT", "ORIGIN_MISMATCH"])("preserves %s so callers can show the appropriate recovery", async (code) => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code } }), { status: 409 }));
  const result = await wardrobeClient.deleteWardrobe("w1");
  expect(result).toMatchObject({ ok: false, error: { code } });
});

test("does not report a malformed successful response as a saved change", async () => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
  expect(await wardrobeClient.renameZone("z1", "新名字")).toMatchObject({ ok: false });
});

test("maps a disconnected request to a retryable network error", async () => {
  vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
  expect(await wardrobeClient.list()).toMatchObject({ ok: false, error: { code: "NETWORK_ERROR" } });
});
