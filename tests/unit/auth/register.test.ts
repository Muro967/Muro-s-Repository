// @vitest-environment node

import { AuthError } from "@/features/auth/auth-errors";
import { hashInviteCode } from "@/features/auth/crypto";
import { registerWithInvite } from "@/features/auth/auth-service";
import { InMemoryAuthRepository } from "../../helpers/in-memory-auth-repository";

const pepper = "pepper-value-with-at-least-32-chars";
const now = new Date("2026-10-16T12:00:00Z");
const sessionToken = "fixed_session_token_with_more_than_40_characters_123";

function validRepository(overrides: {
  maxUses?: number;
  useCount?: number;
  expiresAt?: Date;
  revokedAt?: Date | null;
} = {}) {
  return new InMemoryAuthRepository({
    invite: {
      codeHash: hashInviteCode("valid", pepper),
      maxUses: overrides.maxUses ?? 1,
      useCount: overrides.useCount ?? 0,
      expiresAt: overrides.expiresAt ?? new Date("2026-11-01T00:00:00Z"),
      revokedAt: overrides.revokedAt ?? null,
    },
  });
}

async function register(
  repo: InMemoryAuthRepository,
  overrides: Partial<{
    inviteCode: string;
    email: string;
    password: string;
    name: string;
  }> = {},
) {
  return registerWithInvite(
    {
      inviteCode: "valid",
      email: "MURO@example.com",
      password: "wardrobe-pass-2026",
      name: "Muro",
      ...overrides,
    },
    {
      repository: repo,
      invitePepper: pepper,
      now: () => now,
      createSessionToken: () => sessionToken,
    },
  );
}

test("consumes one valid invite and returns a session", async () => {
  const repo = validRepository();

  const result = await register(repo);

  expect(result.user.email).toBe("muro@example.com");
  expect(result.sessionToken).toBe(sessionToken);
  expect(result.sessionExpiresAt).toEqual(new Date("2026-11-15T12:00:00Z"));
  expect(repo.inviteUseCount).toBe(1);
  expect(repo.storedSessionTokens).toHaveLength(1);
  expect(repo.storedSessionTokens[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(repo.storedSessionTokens[0]).not.toBe(sessionToken);
});

test.each([
  ["expired", { expiresAt: new Date("2026-10-16T11:59:59Z") }],
  ["revoked", { revokedAt: new Date("2026-10-15T00:00:00Z") }],
  ["exhausted", { maxUses: 1, useCount: 1 }],
] as const)("rejects an %s invite without consuming it", async (_label, options) => {
  const repo = validRepository(options);

  await expect(register(repo)).rejects.toMatchObject({ code: "INVALID_INVITE" });
  expect(repo.inviteUseCount).toBe(
    "useCount" in options ? options.useCount : 0,
  );
  expect(repo.userCount).toBe(0);
});

test("rejects an unknown invite without revealing why it is invalid", async () => {
  const repo = validRepository();

  await expect(register(repo, { inviteCode: "not-valid" })).rejects.toEqual(
    new AuthError("INVALID_INVITE"),
  );
});

test("normalizes email before detecting a duplicate account", async () => {
  const repo = validRepository({ maxUses: 2 });
  await register(repo);

  await expect(register(repo, { email: "  muro@EXAMPLE.com " })).rejects.toMatchObject(
    { code: "EMAIL_ALREADY_REGISTERED" },
  );
  expect(repo.inviteUseCount).toBe(1);
});

test("does not reveal an existing email to a caller with an invalid invite", async () => {
  const repo = validRepository();
  await register(repo);

  await expect(register(repo)).rejects.toMatchObject({ code: "INVALID_INVITE" });
});

test.each([
  ["shorter than 10 characters", "123456789"],
  ["longer than 128 characters", "a".repeat(129)],
])("rejects a password %s before consuming an invite", async (_label, password) => {
  const repo = validRepository();

  await expect(register(repo, { password })).rejects.toMatchObject({
    code: "INVALID_PASSWORD",
  });
  expect(repo.inviteUseCount).toBe(0);
});

test.each(["1234567890", "a".repeat(128)])(
  "accepts a password at an inclusive length boundary",
  async (password) => {
    const repo = validRepository();

    await expect(register(repo, { password })).resolves.toBeDefined();
  },
);

test("allows only one registration to consume a single-use invite", async () => {
  const repo = validRepository();

  const results = await Promise.allSettled([
    register(repo, { email: "first@example.com" }),
    register(repo, { email: "second@example.com" }),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
  expect(repo.inviteUseCount).toBe(1);
  expect(repo.userCount).toBe(1);
});
