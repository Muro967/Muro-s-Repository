import { randomUUID } from "node:crypto";

import { AuthError } from "@/features/auth/auth-errors";
import type { AuthRepository } from "@/features/auth/auth-repository";
import type { SessionUser } from "@/features/auth/auth-types";

type Invite = {
  codeHash: string;
  maxUses: number;
  useCount: number;
  expiresAt: Date;
  revokedAt?: Date | null;
};

type StoredUser = SessionUser & { passwordHash: string };

function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    onboardingComplete: user.onboardingComplete,
  };
}

export class InMemoryAuthRepository implements AuthRepository {
  private invite: Invite;
  private users: StoredUser[] = [];
  private sessions = new Map<string, { userId: string; expiresAt: Date }>();
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor({ invite }: { invite: Invite }) {
    this.invite = { ...invite };
  }

  get inviteUseCount() {
    return this.invite.useCount;
  }

  get userCount() {
    return this.users.length;
  }

  get storedSessionTokens() {
    return [...this.sessions.keys()];
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
    const previous = this.transactionQueue;
    let release = () => {};
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      if (
        this.invite.codeHash !== input.inviteHash ||
        this.invite.revokedAt != null ||
        this.invite.expiresAt.getTime() <= input.now.getTime() ||
        this.invite.useCount >= this.invite.maxUses
      ) {
        throw new AuthError("INVALID_INVITE");
      }
      if (this.users.some(({ email }) => email === input.email)) {
        throw new AuthError("EMAIL_ALREADY_REGISTERED");
      }

      const user: StoredUser = {
        id: randomUUID(),
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        onboardingComplete: false,
      };
      this.invite.useCount += 1;
      this.users.push(user);
      this.sessions.set(input.sessionHash, {
        userId: user.id,
        expiresAt: input.sessionExpiresAt,
      });
      return toSessionUser(user);
    } finally {
      release();
    }
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionUser | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
    const user = this.users.find(({ id }) => id === session.userId);
    if (!user) return null;
    return toSessionUser(user);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}
