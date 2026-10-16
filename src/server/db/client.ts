import "server-only";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { readServerEnv } from "../env";
import { schema } from "./schema";
import type { AppDatabase } from "./types";

const globalForDatabase = globalThis as typeof globalThis & {
  __aiWardrobeDatabase?: AppDatabase;
};

let database: AppDatabase | undefined;

function createDatabase(): AppDatabase {
  const environment = readServerEnv();

  if (environment.DATABASE_URL) {
    const client = postgres(environment.DATABASE_URL);
    return drizzlePostgres(client, { schema });
  }

  const client = environment.PGLITE_DATA_DIR
    ? new PGlite(environment.PGLITE_DATA_DIR)
    : new PGlite();
  return drizzlePglite({ client, schema });
}

export function getDb(): AppDatabase {
  const environment = readServerEnv();

  if (
    environment.NODE_ENV === "development" &&
    globalForDatabase.__aiWardrobeDatabase
  ) {
    return globalForDatabase.__aiWardrobeDatabase;
  }

  database ??= createDatabase();

  if (environment.NODE_ENV === "development") {
    globalForDatabase.__aiWardrobeDatabase = database;
  }

  return database;
}
