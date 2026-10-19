// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashInviteCode } from "@/features/auth/crypto";
import { migrateDatabase } from "@/server/db/migrate";
import { inviteCodes } from "@/server/db/schema";
import { getDb } from "@/server/runtime/db";

vi.mock("server-only", () => ({}));
const cookieState = vi.hoisted(() => ({ value: "" }));
vi.mock("next/headers", async () => {
  const { NextRequest } = await import("next/server");
  const request = () => new NextRequest("http://localhost:3000", {
    headers: cookieState.value ? { cookie: cookieState.value } : {},
  });
  return { headers: async () => request().headers, cookies: async () => request().cookies };
});

afterEach(() => { vi.unstubAllEnvs(); cookieState.value = ""; });

describe("production authentication bindings", () => {
  it("imports lazily, sanitizes initialization errors, and binds the real repository", async () => {
    vi.stubEnv("APP_URL", "");
    const { POST: register } = await import("@/app/api/auth/register/route");
    const { POST: login } = await import("@/app/api/auth/login/route");
    const { POST: logout } = await import("@/app/api/auth/logout/route");
    const { GET: session } = await import("@/app/api/auth/session/route");
    for (const handler of [register, login, logout, session]) {
      const response = await handler(new Request("http://localhost:3000/api/auth/session"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: {
        code: "INTERNAL_ERROR", message: "The request could not be completed.",
      } });
    }

    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("INVITE_PEPPER", "production-test-pepper-with-32-characters");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PGLITE_DATA_DIR", "");
    vi.stubEnv("SESSION_COOKIE_SECURE", "false");
    await migrateDatabase(getDb());
    await getDb().insert(inviteCodes).values({
      codeHash: hashInviteCode("production-code", process.env.INVITE_PEPPER!),
      maxUses: 1, expiresAt: new Date("2099-01-01T00:00:00Z"),
    });
    const response = await register(new Request("http://localhost:3000/api/auth/register", {
      method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000",
        "content-type": "application/json" },
      body: JSON.stringify({ inviteCode: "production-code", email: "production@example.com",
        password: "production-password", name: "Production" }),
    }));
    expect(response.status).toBe(201);
    const token = response.headers.get("set-cookie")!.match(/aiw_session=([^;]+)/)![1]!;
    const cookie = `aiw_session=${token}`;
    cookieState.value = cookie;
    const { getCurrentUser } = await import("@/features/auth/current-user");
    expect(await getCurrentUser()).toMatchObject({ email: "production@example.com" });
    const { POST: onboarding } = await import("@/app/api/onboarding/route");
    const saved = await onboarding(new Request("http://localhost:3000/api/onboarding", {
      method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000", cookie,
        "content-type": "application/json" },
      body: JSON.stringify({ name: "Production", city: "上海", hairLength: "中长发", hairTexture: "偏直", wardrobeName: "主卧衣柜" }),
    }));
    expect(saved.status).toBe(200);
    expect(await getCurrentUser()).toMatchObject({ name: "Production", onboardingComplete: true });
    expect((await session(new Request("http://localhost:3000/api/auth/session", { headers: { cookie } }))).status).toBe(200);

    // Real Next RequestCookies collapses duplicate names; only raw headers retain ambiguity.
    for (const badCookie of [
      `aiw_session=invalid; ${cookie}`,
      `${cookie}; ${cookie}`,
      `${cookie}; aiw_session=invalid`,
      "aiw_session=short",
      "aiw_session=bad%20token",
      `aiw_session=${"a".repeat(257)}`,
    ]) {
      cookieState.value = badCookie;
      const request = new NextRequest("http://localhost:3000/api/auth/session", { headers: { cookie: badCookie } });
      expect(request.cookies.getAll("aiw_session")).toHaveLength(1);
      expect((await session(request)).status).toBe(401);
      expect(await getCurrentUser()).toBeNull();
    }
    cookieState.value = cookie;
    expect((await login(new Request("http://localhost:3000/api/auth/login", {
      method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000",
        "content-type": "application/json" },
      body: JSON.stringify({ email: "production@example.com", password: "production-password" }),
    }))).status).toBe(200);
    expect((await logout(new Request("http://localhost:3000/api/auth/logout", {
      method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000", cookie },
    }))).status).toBe(200);
    expect(await getCurrentUser()).toBeNull();
    cookieState.value = "";
    vi.stubEnv("APP_URL", "invalid-config");
    expect(await getCurrentUser()).toBeNull();
  });
});
