import { createRequire } from "node:module";

import { createInvitation } from "../src/features/auth/create-invitation";
import { DrizzleAuthRepository } from "../src/server/db/drizzle-auth-repository";
import { migrateDatabase } from "../src/server/db/migrate";
import { getDb } from "../src/server/runtime/db";
import { readInvitePepper, readServerEnv } from "../src/server/runtime/env";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as typeof import("@next/env");
const quietLogger = { info() {}, error() {} };

function positiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function readArguments(arguments_: string[]) {
  let uses = 1;
  let days = 30;
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (flag === "--uses") uses = positiveInteger(value, flag);
    else if (flag === "--days") days = positiveInteger(value, flag);
    else throw new Error(`Unknown argument: ${flag ?? ""}`);
  }
  return { uses, days };
}

async function closeDatabase(database: ReturnType<typeof getDb>) {
  const client = database.$client as unknown as {
    close?: () => Promise<void>;
    end?: (options?: { timeout?: number }) => Promise<void>;
  };
  if (client.close) await client.close();
  else if (client.end) await client.end({ timeout: 0 });
}

async function main() {
  loadEnvConfig(
    process.cwd(),
    process.env.NODE_ENV === "development",
    quietLogger,
  );
  const { uses, days } = readArguments(process.argv.slice(2));
  const environment = readServerEnv();
  if (!environment.DATABASE_URL && !environment.PGLITE_DATA_DIR) {
    throw new Error(
      "Invite creation requires durable database configuration (DATABASE_URL or PGLITE_DATA_DIR)",
    );
  }
  const pepper = readInvitePepper();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);
  let rawCode: string;
  const database = getDb();

  try {
    await migrateDatabase(database);
    const repository = new DrizzleAuthRepository(database);
    rawCode = await createInvitation({ uses, days }, { repository, pepper, now });
  } finally {
    await closeDatabase(database);
  }

  process.stdout.write(
    `Invite code: ${rawCode}\nExpires at: ${expiresAt.toISOString()}\nMaximum uses: ${uses}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Unable to create invite: ${message}\n`);
  process.exitCode = 1;
});
