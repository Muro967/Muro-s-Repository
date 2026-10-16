import type { AuthResult, SessionUser } from "./auth-types";

export interface AuthRepository {
  register(input: {
    inviteHash: string;
    email: string;
    passwordHash: string;
    name: string;
    sessionHash: string;
    sessionExpiresAt: Date;
    now: Date;
  }): Promise<AuthResult["user"]>;
  findUserByEmail(
    email: string,
  ): Promise<(AuthResult["user"] & { passwordHash: string }) | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<SessionUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
}
