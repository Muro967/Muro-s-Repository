// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { afterEach, vi } from "vitest";

import { readServerEnv } from "@/server/runtime/env";

afterEach(() => {
  delete (globalThis as typeof globalThis & { __aiWardrobeDatabase?: unknown }).__aiWardrobeDatabase;
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("rejects unsafe database URLs without echoing their contents", () => {
  const secretUrl = "https://username:password@example.com/database";

  expect(() =>
    readServerEnv({ DATABASE_URL: secretUrl, NODE_ENV: "test" }),
  ).toThrow("Invalid server environment configuration");

  try {
    readServerEnv({ DATABASE_URL: secretUrl, NODE_ENV: "test" });
  } catch (error) {
    expect(String(error)).not.toContain(secretUrl);
  }
});

test("uses an in-memory PGlite database when DATABASE_URL is empty", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DATA_DIR", "");

  const { getDb } = await import("@/server/runtime/db");
  const db = getDb();

  expect(db.$client).toBeInstanceOf(PGlite);
  const client = db.$client as PGlite;
  await client.waitReady;
  await client.close();
});

test("uses the postgres driver when DATABASE_URL is configured", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://wardrobe:secret@localhost/wardrobe");

  const { getDb } = await import("@/server/runtime/db");
  const db = getDb();

  expect(db.$client).not.toBeInstanceOf(PGlite);
  await (db.$client as { end: (options: { timeout: number }) => Promise<void> }).end(
    { timeout: 0 },
  );
});

test.each(["development", "production"])("reuses one PGlite writer across %s module copies", async (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DATA_DIR", "");

  const firstModule = await import("@/server/runtime/db");
  const first = firstModule.getDb();

  vi.resetModules();
  const secondModule = await import("@/server/runtime/db");
  const second = secondModule.getDb();

  const clients = [...new Set([first.$client as PGlite, second.$client as PGlite])];
  try {
    expect(second).toBe(first);
    await clients[0].exec("CREATE TABLE runtime_module_probe (value text); INSERT INTO runtime_module_probe VALUES ('saved through first module')");
    expect((await (second.$client as PGlite).query("SELECT value FROM runtime_module_probe")).rows).toEqual([{ value: "saved through first module" }]);
  } finally {
    await Promise.all(clients.map(async (client) => { await client.waitReady; await client.close(); }));
  }
});
