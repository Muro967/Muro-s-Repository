import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

import { hashInviteCode } from "../src/features/auth/crypto";
import { DrizzleAuthRepository } from "../src/server/db/drizzle-auth-repository";
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
  const rawCode = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
  const database = getDb();

  try {
    const repository = new DrizzleAuthRepository(database);
    await repository.createInvite({
      codeHash: hashInviteCode(rawCode, pepper),
      maxUses: uses,
      expiresAt,
    });
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
