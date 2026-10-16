import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { AuthError } from "../../features/auth/auth-errors";
import type { AuthRepository } from "../../features/auth/auth-repository";
import type { SessionUser } from "../../features/auth/auth-types";
import {
  inviteCodes,
  sessions,
  userSettings,
  users,
  wardrobes,
} from "./schema";
import type { AppDatabase, PgliteAppDatabase } from "./types";

function isUniqueEmailViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    const record = current as Record<string, unknown>;
    const constraint = record.constraint ?? record.constraint_name;
    if (
      (record.code === "23505" && constraint === "users_email_unique") ||
      (typeof record.message === "string" &&
        record.message.includes("users_email_unique") &&
        record.message.toLowerCase().includes("duplicate"))
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

export class DrizzleAuthRepository implements AuthRepository {
  private readonly db: PgliteAppDatabase;

  constructor(database: AppDatabase) {
    // Both supported drivers extend Drizzle's PgDatabase and expose the same
    // query-builder API. The concrete HKT differs only in returned row metadata.
    this.db = database as unknown as PgliteAppDatabase;
  }

  async createInvite(input: {
    codeHash: string;
    maxUses: number;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.insert(inviteCodes).values(input);
  }

  async register(input: {
    inviteHash: string;
    email: string;
    passwordHash: string;
    name: string;
    sessionHash: string;
    sessionExpiresAt: Date;
    now: Date;
  }): Promise<SessionUser> {
    try {
      return await this.db.transaction(async (transaction) => {
        // PostgreSQL takes a row lock for this guarded update. Validation and
        // consumption therefore happen atomically even under concurrent use.
        const consumed = await transaction
          .update(inviteCodes)
          .set({ useCount: sql`${inviteCodes.useCount} + 1` })
          .where(
            and(
              eq(inviteCodes.codeHash, input.inviteHash),
              isNull(inviteCodes.revokedAt),
              gt(inviteCodes.expiresAt, input.now),
              sql`${inviteCodes.useCount} < ${inviteCodes.maxUses}`,
            ),
          )
          .returning({ id: inviteCodes.id });
        if (consumed.length !== 1) {
          throw new AuthError("INVALID_INVITE");
        }

        const created = await transaction
          .insert(users)
          .values({
            email: input.email,
            passwordHash: input.passwordHash,
            name: input.name,
          })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            onboardingComplete: users.onboardingComplete,
          });
        const user = created[0];
        if (!user) throw new Error("Registration did not create a user");

        await transaction.insert(userSettings).values({ userId: user.id });
        await transaction.insert(wardrobes).values({
          userId: user.id,
          name: "我的衣柜",
          sortOrder: 0,
        });
        await transaction.insert(sessions).values({
          userId: user.id,
          tokenHash: input.sessionHash,
          expiresAt: input.sessionExpiresAt,
        });

        return user;
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (isUniqueEmailViolation(error)) {
        throw new AuthError("EMAIL_ALREADY_REGISTERED");
      }
      // Drizzle query errors can include bound values. Do not let password or
      // session hashes escape into framework logs through an error message.
      throw new Error("Authentication persistence failed");
    }
  }

  async findUserByEmail(email: string) {
    const result = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        onboardingComplete: users.onboardingComplete,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.db.insert(sessions).values({ userId, tokenHash, expiresAt });
    } catch {
      throw new Error("Session persistence failed");
    }
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionUser | null> {
    try {
      const result = await this.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          onboardingComplete: users.onboardingComplete,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
        )
        .limit(1);
      return result[0] ?? null;
    } catch {
      throw new Error("Session lookup failed");
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    try {
      await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    } catch {
      throw new Error("Session deletion failed");
    }
  }
}
