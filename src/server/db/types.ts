import type { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import type { schema } from "./schema";

export type AppSchema = typeof schema;

export type PgliteAppDatabase<
  TSchema extends Record<string, unknown> = AppSchema,
> = PgliteDatabase<TSchema> & { $client: PGlite };

export type PostgresAppDatabase<
  TSchema extends Record<string, unknown> = AppSchema,
> = PostgresJsDatabase<TSchema> & { $client: Sql };

export type AppDatabase<
  TSchema extends Record<string, unknown> = AppSchema,
> = PgliteAppDatabase<TSchema> | PostgresAppDatabase<TSchema>;
