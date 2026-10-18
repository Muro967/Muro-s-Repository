// @vitest-environment node

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getProductionAuthRouteDependencies } from "@/server/runtime/auth";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://wardrobe.example");
  vi.stubEnv("DATABASE_URL", "postgres://app:unused@localhost/wardrobe");
  vi.stubEnv("PGLITE_DATA_DIR", "");
  vi.stubEnv("INVITE_PEPPER", "production-test-pepper-with-at-least-32-chars");
  vi.stubEnv("SESSION_COOKIE_SECURE", "true");
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["APP_URL", "https://wardrobe.example/path?secret"],
  ["APP_URL", "https://username:password@wardrobe.example"],
  ["APP_URL", "http://wardrobe.example"],
  ["APP_URL", ""],
  ["SESSION_COOKIE_SECURE", "false"],
  ["INVITE_PEPPER", "short-secret"],
])("rejects unsafe production %s configuration without echoing values", (key, value) => {
  vi.stubEnv(key, value);
  expect(() => getProductionAuthRouteDependencies()).toThrow();
  try { getProductionAuthRouteDependencies(); } catch (error) {
    expect(String(error)).not.toContain(value || "undefined");
  }
});

it("rejects an ephemeral production authentication database", () => {
  vi.stubEnv("DATABASE_URL", "");
  expect(() => getProductionAuthRouteDependencies()).toThrow("durable");
});

it("rejects malformed cookie configuration even in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SESSION_COOKIE_SECURE", "true-with-a-typo");
  expect(() => getProductionAuthRouteDependencies()).toThrow("configuration");
});

it("constructs valid production dependencies without connecting on import", () => {
  const dependencies = getProductionAuthRouteDependencies();
  expect(dependencies.appUrl).toBe("https://wardrobe.example");
  expect(dependencies.sessionCookieSecure).toBe(true);
  expect(dependencies.createSessionToken()).toMatch(/^[a-zA-Z0-9_-]{43}$/);
});
