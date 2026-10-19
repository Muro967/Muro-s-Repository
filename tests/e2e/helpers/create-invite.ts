import { createInvitation } from "../../../src/features/auth/create-invitation";
import { DrizzleAuthRepository } from "../../../src/server/db/drizzle-auth-repository";
import type { AppDatabase } from "../../../src/server/db/types";

export function inviteCodeFor(name: string): string {
  const values: unknown = JSON.parse(process.env.E2E_INVITES ?? "{}");
  const code = (values as Record<string, unknown>)[name];
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(code)) {
    throw new Error("Missing isolated E2E invitation");
  }
  return code;
}

// Seed before the web server opens PGlite: never open a second writer during a test.
export async function createInvite(database: AppDatabase, name: string) {
  return createInvitation({ uses: 1, days: 1 }, {
    repository: new DrizzleAuthRepository(database),
    pepper: process.env.INVITE_PEPPER!,
    generateCode: () => inviteCodeFor(name),
  });
}
