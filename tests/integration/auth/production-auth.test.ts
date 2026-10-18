// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { hashInviteCode } from "@/features/auth/crypto";
import { migrateDatabase } from "@/server/db/migrate";
import { inviteCodes } from "@/server/db/schema";
import { getDb } from "@/server/runtime/db";

vi.mock("server-only", () => ({}));
const cookieState = vi.hoisted(() => ({ value: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: (name: string) => cookieState.value ? [{ name, value: cookieState.value }] : [],
}) }));

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
    cookieState.value = response.headers.get("set-cookie")!.match(/aiw_session=([^;]+)/)![1]!;
    const cookie = `aiw_session=${cookieState.value}`;
    const { getCurrentUser } = await import("@/features/auth/current-user");
    expect(await getCurrentUser()).toMatchObject({ email: "production@example.com" });
    expect((await session(new Request("http://localhost:3000/api/auth/session", { headers: { cookie } }))).status).toBe(200);
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
