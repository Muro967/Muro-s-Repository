// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { afterEach, vi } from "vitest";

import { readServerEnv } from "@/server/env";

afterEach(() => {
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

  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  expect(db.$client).toBeInstanceOf(PGlite);
  const client = db.$client as PGlite;
  await client.waitReady;
  await client.close();
});

test("uses the postgres driver when DATABASE_URL is configured", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://wardrobe:secret@localhost/wardrobe");

  const { getDb } = await import("@/server/db/client");
  const db = getDb();

  expect(db.$client).not.toBeInstanceOf(PGlite);
  await (db.$client as { end: (options: { timeout: number }) => Promise<void> }).end(
    { timeout: 0 },
  );
});

test("reuses the database connection across development module reloads", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DATA_DIR", "");

  const firstModule = await import("@/server/db/client");
  const first = firstModule.getDb();

  vi.resetModules();
  const secondModule = await import("@/server/db/client");
  const second = secondModule.getDb();

  expect(second).toBe(first);
  const client = first.$client as PGlite;
  await client.waitReady;
  await client.close();
});
