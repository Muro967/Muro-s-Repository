// @vitest-environment node

import { randomUUID } from "node:crypto";

import { createPrivateInspirationImageHandler } from "@/features/inspiration/private-inspiration-image-route";
import { hashSessionToken } from "@/features/auth/crypto";
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

function request(cookie = `aiw_session=${token}`) {
  return new Request("http://localhost:3000/api/inspirations/image", {
    headers: cookie ? { cookie } : {},
  });
}

test("streams exact private bytes with a safe MIME and no cache", async () => {
  const upload = await f.upload();
  const inspiration = await f.service.create(f.user.id, { uploadId: upload.id });
  const { GET } = await import("@/app/api/inspirations/[inspirationId]/image/route");
  const response = await GET(request(), {
    params: Promise.resolve({ inspirationId: inspiration.id }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect([...response.headers.values()].join(" ")).not.toContain(upload.objectKey);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(upload.data);
});

test("uses indistinguishable 404s for anonymous, foreign, unknown, deleted and storage failures", async () => {
  const upload = await f.upload();
  const inspiration = await f.service.create(f.user.id, { uploadId: upload.id });
  const handler = createPrivateInspirationImageHandler(f);
  const anonymous = await handler(request(""), inspiration.id);
  expect(anonymous.status).toBe(404);
  const reference = await anonymous.text();

  for (const [cookie, id] of [
    [`aiw_session=${otherToken}`, inspiration.id],
    [`aiw_session=${token}`, randomUUID()],
    [`aiw_session=${token}`, "bad"],
  ]) {
    const response = await handler(request(cookie), id);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(reference);
  }

  await f.service.remove(f.user.id, inspiration.id, { expectedVersion: 1 });
  const deleted = await handler(request(), inspiration.id);
  expect(deleted.status).toBe(404);
  expect(await deleted.text()).toBe(reference);

  const nextUpload = await f.upload();
  const next = await f.service.create(f.user.id, { uploadId: nextUpload.id });
  f.provider.objects.delete(nextUpload.objectKey);
  const missingObject = await handler(request(), next.id);
  expect(missingObject.status).toBe(404);
  expect(await missingObject.text()).toBe(reference);
});
