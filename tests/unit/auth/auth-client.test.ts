import { logout, submitAuth, submitOnboarding } from "@/features/auth/auth-client";

afterEach(() => vi.unstubAllGlobals());
const user = { id: "user", name: "Muro", email: "muro@example.com", onboardingComplete: false };
const credentials = { email: user.email, password: "wardrobe-pass-2026" };

test("validates the real request boundary and strips repository-only response fields", async () => {
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path !== "/api/auth/login" || init.credentials !== "same-origin" || init.method !== "POST" || JSON.stringify(JSON.parse(String(init.body))) !== JSON.stringify(credentials)) {
      return new Response("{}", { status: 400 });
    }
    return Response.json({ user: { ...user, sessionToken: "private-token", passwordHash: "private-hash" } });
  });
  expect(await submitAuth("login", credentials)).toEqual({ ok: true, value: user });
});

test.each([
  ["INVALID_INVITE", "邀请码无效或已过期，请检查邀请码或联系邀请人。", { inviteCode: "请检查邀请码是否完整、有效" }],
  ["EMAIL_IN_USE", "这个邮箱已注册，请直接登录。", { email: "这个邮箱已注册，请前往登录" }],
  ["INVALID_INPUT", "请检查填写内容后重试。", { city: "请输入常用城市，最多 80 个字符" }],
  ["UNAUTHORIZED", "登录已过期，请重新登录。", {}],
])("translates %s without displaying server messages", async (code, message, fields) => {
  vi.stubGlobal("fetch", async () => Response.json({ error: { code, message: "private-query-secret", fields: code === "INVALID_INPUT" ? { city: "private-value", secretKey: "private-value" } : {} } }, { status: 400 }));
  expect(await submitOnboarding({ name: "Muro", city: "上海", hairLength: "短发", hairTexture: "偏直", wardrobeName: "我的衣柜" })).toEqual({ ok: false, error: { code, message, fields } });
});

test("gives safe retry guidance for malformed responses and rejected connections", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ sessionToken: "private-token" }));
  expect(await submitAuth("login", credentials)).toMatchObject({ ok: false, error: { message: "暂时无法保存，请稍后重试。" } });
  vi.stubGlobal("fetch", async () => { throw new Error("private-network-secret"); });
  expect(await logout()).toEqual({ ok: false, error: { code: "NETWORK_ERROR", message: "暂时无法连接，请检查网络连接后重试。" } });
});

test("logout only succeeds after a valid server acknowledgment", async () => {
  vi.stubGlobal("fetch", async (path: string) => Response.json({ ok: path === "/api/auth/logout" }));
  expect(await logout()).toEqual({ ok: true, value: { ok: true } });
});
