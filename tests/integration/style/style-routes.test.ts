// @vitest-environment node

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

let f: Awaited<ReturnType<typeof inspirationFixture>>;

beforeEach(async () => {
  f = await inspirationFixture();
  for (let index = 0; index < 5; index++) {
    const upload = await f.upload();
    await f.service.create(f.user.id, {
      uploadId: upload.id,
      colorNames: index < 4 ? ["米白"] : ["灰绿"],
      silhouettes: ["宽松"],
      combinations: ["风衣+阔腿裤"],
      formality: "通勤",
    });
  }
});

afterEach(async () => {
  await f.client.close();
});

function request(path: string, body?: unknown, signedIn = true) {
  const value = jsonRequest(path, body);
  if (signedIn) value.headers.set("cookie", `aiw_session=${token}`);
  return value;
}

test("reads and regenerates a real profile without inventing percentages", async () => {
  const route = await import("@/app/api/style-profile/route");
  const read = request("/api/style-profile");
  read.headers.delete("origin");
  expect(await (await route.GET(read)).json()).toMatchObject({
    style: { validCount: 5, remaining: 0, current: null },
  });
  const generated = await route.POST(request("/api/style-profile", {}));
  expect(generated.status).toBe(200);
  const body = await generated.json();
  expect(body.style.current).toMatchObject({
    preferredColors: ["米白", "灰绿"],
    manuallyEdited: false,
  });
  expect(JSON.stringify(body)).not.toContain("%");
});

test("preserves manual edits and requires explicit acceptance of a new suggestion", async () => {
  const route = await import("@/app/api/style-profile/route");
  const generated = await (await route.POST(request("/api/style-profile", {}))).json();
  const current = generated.style.current;
  const saved = await route.PUT(request("/api/style-profile", {
    expectedUpdatedAt: current.updatedAt,
    preferredColors: ["豆沙"],
    preferredSilhouettes: current.preferredSilhouettes,
    commonCombinations: current.commonCombinations,
    formalityTendency: current.formalityTendency,
    likedExamples: current.likedExamples,
  }));
  expect((await saved.json()).style).toMatchObject({ preferredColors: ["豆沙"], manuallyEdited: true });
  const regenerated = await (await route.POST(request("/api/style-profile", {}))).json();
  expect(regenerated.style.current).toMatchObject({ preferredColors: ["豆沙"], pendingSuggestion: expect.any(Object) });
  const accepted = await route.PUT(request("/api/style-profile", {
    action: "accept-suggestion",
    expectedUpdatedAt: regenerated.style.current.updatedAt,
  }));
  expect((await accepted.json()).style).toMatchObject({ preferredColors: ["米白", "灰绿"], pendingSuggestion: null });
});

test("creates, updates and deletes disliked rules with version checks", async () => {
  const root = await import("@/app/api/style-rules/route");
  const member = await import("@/app/api/style-rules/[ruleId]/route");
  const created = await root.POST(request("/api/style-rules", {
    type: "color",
    value: "不要大面积亮色",
    enabled: true,
  }));
  expect(created.status).toBe(201);
  const rule = (await created.json()).rule;
  const context = { params: Promise.resolve({ ruleId: rule.id }) };
  const updated = await member.PATCH(request(`/api/style-rules/${rule.id}`, {
    expectedUpdatedAt: rule.updatedAt,
    enabled: false,
  }), context);
  const disabled = (await updated.json()).rule;
  expect(disabled.enabled).toBe(false);
  expect((await member.PATCH(request(`/api/style-rules/${rule.id}`, {
    expectedUpdatedAt: rule.updatedAt,
    enabled: true,
  }), context)).status).toBe(409);
  expect((await member.DELETE(request(`/api/style-rules/${rule.id}`, {
    expectedUpdatedAt: disabled.updatedAt,
  }), context)).status).toBe(200);
});

test("applies authentication and origin checks to every write", async () => {
  const profile = await import("@/app/api/style-profile/route");
  const rules = await import("@/app/api/style-rules/route");
  expect((await profile.POST(request("/api/style-profile", {}, false))).status).toBe(401);
  const denied = request("/api/style-rules", { type: "text", value: "不要豹纹", enabled: true });
  denied.headers.delete("origin");
  expect((await rules.POST(denied)).status).toBe(403);
  expect(denied.bodyUsed).toBe(false);
});
