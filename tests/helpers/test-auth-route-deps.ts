import { hashInviteCode } from "@/features/auth/crypto";
import type { AuthDependencies } from "@/features/auth/auth-types";
import { InMemoryAuthRepository } from "./in-memory-auth-repository";

export type TestAuthRouteDeps = AuthDependencies & {
  appUrl: string;
  sessionCookieSecure: boolean;
  inviteCode: string;
};

export function testAuthRouteDeps(): TestAuthRouteDeps {
  let sessionSequence = 0;
  const invitePepper = "test-only-invite-pepper-with-at-least-32-characters";
  const inviteCode = "valid-code";
  return {
    repository: new InMemoryAuthRepository({
      invite: {
        codeHash: hashInviteCode(inviteCode, invitePepper),
        maxUses: 2,
        useCount: 0,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    }),
    invitePepper,
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    createSessionToken: () =>
      `deterministic-test-session-token-with-more-than-forty-characters-${++sessionSequence}`,
    appUrl: "http://localhost:3000",
    sessionCookieSecure: false,
    inviteCode,
  };
}
