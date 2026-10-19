// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUploadHandlers } from "@/features/storage/upload-routes";
import { LocalStorageProvider } from "@/features/storage/local-storage-provider";
import { DrizzleStorageRepository } from "@/server/db/drizzle-storage-repository";
import { migrateDatabase } from "@/server/db/migrate";
import { schema, users, sessions } from "@/server/db/schema";
import { DrizzleAuthRepository } from "@/server/db/drizzle-auth-repository";
import { hashSessionToken } from "@/features/auth/crypto";
import { FakeStorageProvider } from "../../helpers/fake-storage-provider";
vi.mock("server-only", () => ({}));
let client: PGlite; let root: string;
const userA = "7eb88376-1895-4c81-b872-ce2fbdc08af4";
const userB = "98faec69-8134-470d-b0d4-cdf5e536ab98";
const token = (id: string) => `test-session-token-with-more-than-forty-characters-${id}`;
function request(method: string, body?: unknown, user = userA, extra: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/uploads", { method,
    headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `aiw_session=${token(user)}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
beforeEach(async () => { client = new PGlite(); root = await mkdtemp(join(tmpdir(), "aiw-upload-route-")); });
afterEach(async () => { if (!client.closed) await client.close(); await rm(root, { recursive: true, force: true }); });
async function setup() {
  const database = drizzle({ client, schema }); await migrateDatabase(database);
  await database.insert(users).values([userA, userB].map((id) => ({ id, email: `${id}@example.com`, passwordHash: "hash", name: id })));
  await database.insert(sessions).values([userA, userB].map((id) => ({ userId: id, tokenHash: hashSessionToken(token(id)), expiresAt: new Date("2030-01-01Z") })));
  const repository = new DrizzleStorageRepository(database);
  const deps = { appUrl: "http://localhost:3000", authRepository: new DrizzleAuthRepository(database), repository, provider: new LocalStorageProvider(root), now: () => new Date("2026-10-18T12:00:00Z") };
  return { handlers: createUploadHandlers(deps), deps };
}
const input = { kind: "wear-photo", contentType: "image/jpeg", sizeBytes: 3 };

test("authenticated local upload completes through real storage and tenant-scoped SQL", async () => {
  const { handlers, deps } = await setup();
  const response = await handlers.create(request("POST", input)); expect(response.status).toBe(201);
  const target = await response.json(); expect(Object.keys(target).sort()).toEqual(["headers", "method", "uploadId", "url"]);
  expect(target.url).toBe(`/api/uploads/${target.uploadId}/content`);
  const id = target.uploadId;
  expect((await handlers.complete(request("POST", undefined, userB), id)).status).toBe(404);
  expect((await handlers.put(request("PUT", "abc", userB, { "content-type": "image/jpeg", "content-length": "3" }), id)).status).toBe(404);
  expect((await handlers.complete(request("POST"), id)).status).toBe(409);
  expect((await handlers.put(request("PUT", "abc", userA, { "content-type": "image/jpeg", "content-length": "3" }), id)).status).toBe(200);
  const completed = await Promise.all([handlers.complete(request("POST"), id), handlers.complete(request("POST"), id)]);
  expect(await Promise.all(completed.map((r) => r.json()))).toEqual([{ uploadId: id, status: "completed" }, { uploadId: id, status: "completed" }]);
  expect((await handlers.complete(request("POST"), id)).status).toBe(200);
  expect((await handlers.put(request("PUT", "xyz", userA, { "content-type": "image/jpeg", "content-length": "3" }), id)).status).toBe(409);
  expect(await deps.repository.findOwned(id, userB)).toBeNull();
  const rows = await client.query<{ status: string; completed_at: Date }>("select status, completed_at from uploads where id = $1", [id]);
  expect(rows.rows[0]?.status).toBe("completed"); expect(rows.rows[0]?.completed_at).not.toBeNull();
  expect(await deps.repository.completePending(id, userB, new Date())).toBe(false);
  expect(await deps.repository.completePending(id, userA, new Date("2027-01-01Z"))).toBe(false);
  expect((await deps.repository.findOwned(id, userA))?.completedAt).toEqual(deps.now());
});

test("rejects unauthenticated and cross-origin mutations before processing uploads", async () => {
  const { handlers } = await setup(); const id = "286bf6d0-19b7-4da8-aec8-e292ae59c526";
  for (const invoke of [(r: Request) => handlers.create(r), (r: Request) => handlers.put(r, id), (r: Request) => handlers.complete(r, id)]) {
    expect((await invoke(request("POST", input, userA, { cookie: "" }))).status).toBe(401);
    expect((await invoke(request("POST", input, userA, { origin: "https://evil.test" }))).status).toBe(403);
  }
  const invalid = await handlers.create(request("POST", { ...input, sizeBytes: 16 * 1024 * 1024 }));
  expect(invalid.status).toBe(400); expect((await invalid.json()).error.code).toBe("UNSUPPORTED_UPLOAD");
  expect((await handlers.complete(request("POST"), "not-a-uuid")).status).toBe(404);
});

test("enforces local content metadata and actual byte count without completing bad content", async () => {
  const { handlers } = await setup(); const { uploadId } = await (await handlers.create(request("POST", input))).json();
  for (const headers of [{ "content-type": "application/pdf", "content-length": "3" }, { "content-type": "image/jpeg", "content-length": "4" }, { "content-type": "image/jpeg", "content-length": "0" }]) {
    expect((await handlers.put(request("PUT", "abc", userA, headers), uploadId)).status).toBe(400);
  }
  expect((await handlers.put(request("PUT", "abcd", userA, { "content-type": "image/jpeg", "content-length": "3" }), uploadId)).status).toBe(400);
  expect((await handlers.complete(request("POST"), uploadId)).status).toBe(409);
  expect((await handlers.put(request("PUT", "abc", userA, { "content-type": "image/jpeg" }), uploadId)).status).toBe(200);
});

test("sanitizes repository and production binding configuration failures", async () => {
  const { handlers } = await setup(); await client.close();
  const failed = await handlers.create(request("POST", input));
  expect(failed.status).toBe(500); expect(await failed.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
  vi.stubEnv("APP_URL", "invalid");
  try {
    const { POST } = await import("@/app/api/uploads/route");
    const { PUT } = await import("@/app/api/uploads/[uploadId]/content/route");
    const { POST: complete } = await import("@/app/api/uploads/[uploadId]/complete/route");
    expect((await POST(request("POST", input))).status).toBe(500);
    expect((await PUT(request("PUT"), { params: Promise.resolve({ uploadId: userA }) })).status).toBe(500);
    expect((await complete(request("POST"), { params: Promise.resolve({ uploadId: userA }) })).status).toBe(500);
  } finally { vi.unstubAllEnvs(); }
});

test("disables local PUT for remote providers after ownership checks", async () => {
  const { deps } = await setup(); const handlers = createUploadHandlers({ ...deps, provider: new FakeStorageProvider() });
  const { uploadId } = await (await handlers.create(request("POST", input))).json();
  expect((await handlers.put(request("PUT", "abc", userA, { "content-type": "image/jpeg", "content-length": "3" }), uploadId)).status).toBe(404);
});

test("production bindings lazily use the configured local provider and real auth/database", async () => {
  vi.stubEnv("APP_URL", "http://localhost:3000"); vi.stubEnv("INVITE_PEPPER", "test-only-invite-pepper-with-at-least-32-characters");
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DATA_DIR", ""); vi.stubEnv("SESSION_COOKIE_SECURE", "false");
  vi.stubEnv("STORAGE_DRIVER", "local"); vi.stubEnv("LOCAL_STORAGE_DIR", root);
  try {
    const { getDb } = await import("@/server/runtime/db"); const database = getDb(); await migrateDatabase(database);
    await database.insert(users).values({ id: userA, email: "bound@example.com", passwordHash: "hash", name: "Bound" });
    await database.insert(sessions).values({ userId: userA, tokenHash: hashSessionToken(token(userA)), expiresAt: new Date("2030-01-01Z") });
    const { POST } = await import("@/app/api/uploads/route"); const { PUT } = await import("@/app/api/uploads/[uploadId]/content/route");
    const { POST: complete } = await import("@/app/api/uploads/[uploadId]/complete/route");
    const created = await POST(request("POST", input)); expect(created.status).toBe(201);
    const { uploadId } = await created.json(); const context = { params: Promise.resolve({ uploadId }) };
    expect((await PUT(request("PUT", "abc", userA, { "content-type": "image/jpeg", "content-length": "3" }), context)).status).toBe(200);
    expect(await (await complete(request("POST"), context)).json()).toEqual({ uploadId, status: "completed" });
    await (database.$client as PGlite).close();
  } finally { vi.unstubAllEnvs(); }
});
