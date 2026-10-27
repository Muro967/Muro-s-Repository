// @vitest-environment node

import { createInspirationHandlers } from "@/features/inspiration/inspiration-routes";
import { hashSessionToken } from "@/features/auth/crypto";
import { jsonRequest } from "../../helpers/http-request";
import { inspirationFixture } from "../../helpers/inspiration-fixture";
import { token } from "../../helpers/wardrobe-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({
  getProductionAuthRouteDependencies: () => ({
    appUrl: f.appUrl,
    repository: f.authRepository,
    now: f.now,
  }),
}));
vi.mock("@/server/db/client", () => ({ getDb: () => f.database }));
vi.mock("@/server/storage", () => ({ createStorageProvider: () => f.provider }));

let f: Awaited<ReturnType<typeof inspirationFixture>>;
const otherToken = "other-inspiration-session-token-with-forty-characters";

beforeEach(async () => {
  f = await inspirationFixture();
  await f.client.query("update sessions set token_hash = $1 where user_id = $2", [hashSessionToken(otherToken), f.other.id]);
});

afterEach(async () => {
  await f.client.close();
});

function request(path: string, body?: unknown, signedIn = true) {
  const result = jsonRequest(path, body);
  if (signedIn) result.headers.set("cookie", `aiw_session=${token}`);
  return result;
}

test("authenticates reads and checks mutation origin before consuming the body", async () => {
  const handlers = createInspirationHandlers(f);
  const denied = request("/api/inspirations", {});
  denied.headers.delete("origin");
  expect((await handlers.create(denied)).status).toBe(403);
  expect(denied.bodyUsed).toBe(false);
  expect((await handlers.create(request("/api/inspirations", {}, false))).status).toBe(401);
  expect((await handlers.list(request("/api/inspirations", undefined, false))).status).toBe(401);

  const malformed = new Request(request("/api/inspirations", {}), { body: "{" });
  expect((await handlers.create(malformed)).status).toBe(400);
});

test("creates, lists, reads and edits through real Next handlers with async params", async () => {
  const upload = await f.upload();
  const root = await import("@/app/api/inspirations/route");
  const member = await import("@/app/api/inspirations/[inspirationId]/route");

  const createdResponse = await root.POST(request("/api/inspirations", {
    uploadId: upload.id,
    name: "秋日通勤",
    colorNames: ["灰绿"],
  }));
  expect(createdResponse.status).toBe(201);
  const { inspiration } = await createdResponse.json();
  expect(inspiration).toMatchObject({ name: "秋日通勤", version: 1 });
  const context = { params: Promise.resolve({ inspirationId: inspiration.id }) };

  const readRequest = request(`/api/inspirations/${inspiration.id}`);
  readRequest.headers.delete("origin");
  const read = await member.GET(readRequest, context);
  expect(read.status).toBe(200);
  expect(read.headers.get("cache-control")).toBe("no-store");
  const readText = await read.text();
  expect(readText).not.toContain(upload.objectKey);
  expect(readText).not.toContain("userId");
  expect(readText).not.toContain("uploadId");

  const updated = await member.PATCH(request(`/api/inspirations/${inspiration.id}`, {
    expectedVersion: 1,
    styleTags: ["极简"],
  }), context);
  expect(updated.status).toBe(200);
  expect((await updated.json()).inspiration).toMatchObject({ styleTags: ["极简"], version: 2 });

  const conflict = await member.PATCH(request(`/api/inspirations/${inspiration.id}`, {
    expectedVersion: 1,
    name: "过期写入",
  }), context);
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });

  const listRequest = request("/api/inspirations");
  listRequest.headers.delete("origin");
  const listed = await root.GET(listRequest);
  expect(listed.status).toBe(200);
  expect((await listed.json()).inspirations).toHaveLength(1);
});

test("returns identical not-found responses for foreign and malformed resources", async () => {
  const upload = await f.upload();
  const created = await f.service.create(f.user.id, { uploadId: upload.id });
  const handlers = createInspirationHandlers(f);
  const reference = await handlers.read(request("/api/inspirations/bad"), "bad");
  expect(reference.status).toBe(404);

  const foreignRequest = request(`/api/inspirations/${created.id}`);
  foreignRequest.headers.set("cookie", `aiw_session=${otherToken}`);
  const foreign = await handlers.read(foreignRequest, created.id);
  expect(foreign.status).toBe(404);
  expect(await foreign.text()).toBe(await reference.text());
});

test("deletes with a version and rejects uncontrolled request fields", async () => {
  const upload = await f.upload();
  const created = await f.service.create(f.user.id, { uploadId: upload.id });
  const handlers = createInspirationHandlers(f);
  expect((await handlers.update(request("/api/inspirations/id", {
    expectedVersion: 1,
    analysisStatus: "ready",
  }), created.id)).status).toBe(400);
  expect((await handlers.remove(request("/api/inspirations/id", {
    expectedVersion: 1,
    force: true,
  }), created.id)).status).toBe(400);
  expect((await handlers.remove(request("/api/inspirations/id", {
    expectedVersion: 1,
  }), created.id)).status).toBe(200);
});
