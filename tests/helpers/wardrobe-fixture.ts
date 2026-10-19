import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { hashSessionToken } from "@/features/auth/crypto";
import { DrizzleAuthRepository } from "@/server/db/drizzle-auth-repository";
import { DrizzleWardrobeRepository } from "@/server/db/drizzle-wardrobe-repository";
import { migrateDatabase } from "@/server/db/migrate";
import { schema } from "@/server/db/schema";

export const token = "wardrobe-session-with-more-than-forty-characters";
export async function wardrobeFixture() {
  const client = new PGlite();
  const database = drizzle({ client, schema });
  await migrateDatabase(database);
  const authRepository = new DrizzleAuthRepository(database);
  await authRepository.createInvite({ codeHash: "invite", maxUses: 2, expiresAt: new Date("2030-01-01") });
  const now = () => new Date("2026-10-19");
  const register = (email: string, sessionHash: string) => authRepository.register({ inviteHash: "invite", email, passwordHash: "hash", name: "Owner", sessionHash, sessionExpiresAt: new Date("2030-01-01"), now: now() });
  const user = await register("a@example.com", hashSessionToken(token));
  const other = await register("b@example.com", "other-session");
  const repository = new DrizzleWardrobeRepository(database);
  const [source] = await repository.list(user.id);
  const [foreign] = await repository.list(other.id);
  return { client, database, repository, authRepository, user, other, source: source!, foreign: foreign!, now, appUrl: "http://localhost:3000" };
}
