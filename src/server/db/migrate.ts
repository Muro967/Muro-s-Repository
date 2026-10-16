import { PGlite } from "@electric-sql/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";

import type { AppDatabase, PgliteAppDatabase } from "./types";

const migrationsFolder = resolve(process.cwd(), "drizzle");

function isPgliteDatabase<TSchema extends Record<string, unknown>>(
  db: AppDatabase<TSchema>,
): db is PgliteAppDatabase<TSchema> {
  return db.$client instanceof PGlite;
}

export async function migrateDatabase<
  TSchema extends Record<string, unknown>,
>(db: AppDatabase<TSchema>) {
  if (isPgliteDatabase(db)) {
    await migratePglite(db, { migrationsFolder });
    return;
  }

  await migratePostgres(db, { migrationsFolder });
}
