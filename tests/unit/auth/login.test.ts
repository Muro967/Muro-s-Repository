// @vitest-environment node

import { hashInviteCode } from "@/features/auth/crypto";
import {
  loginWithPassword,
  logoutSession,
  readSession,
  registerWithInvite,
} from "@/features/auth/auth-service";
import { hashSessionToken } from "@/features/auth/crypto";
import { InMemoryAuthRepository } from "../../helpers/in-memory-auth-repository";

const pepper = "pepper-value-with-at-least-32-chars";
const now = new Date("2026-10-16T12:00:00Z");

async function registeredRepository() {
  const repository = new InMemoryAuthRepository({
    invite: {
      codeHash: hashInviteCode("valid", pepper),
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    },
  });
  await registerWithInvite(
    {
      inviteCode: "valid",
      email: "muro@example.com",
      password: "wardrobe-pass-2026",
      name: "Muro",
    },
    {
      repository,
      invitePepper: pepper,
      now: () => now,
      createSessionToken: () => "registration_session_token_more_than_40_chars_123",
    },
  );
  return repository;
}

test("logs in with a normalized email and returns a new session", async () => {
  const repository = await registeredRepository();
  const loginToken = "login_session_token_with_more_than_40_characters_123";

  const result = await loginWithPassword(
    { email: " MURO@EXAMPLE.COM ", password: "wardrobe-pass-2026" },
    {
      repository,
      invitePepper: pepper,
      now: () => now,
      createSessionToken: () => loginToken,
    },
  );

  expect(result.user.email).toBe("muro@example.com");
  expect(result.sessionToken).toBe(loginToken);
  expect(repository.storedSessionTokens).not.toContain(loginToken);
  await expect(readSession(loginToken, repository, now)).resolves.toEqual(
    result.user,
  );
});

test.each([
  ["wrong password", "muro@example.com", "incorrect-password"],
  ["unknown email", "unknown@example.com", "wardrobe-pass-2026"],
])("rejects %s with the same credentials error", async (_label, email, password) => {
  const repository = await registeredRepository();

  await expect(
    loginWithPassword(
      { email, password },
      {
        repository,
        invitePepper: pepper,
        now: () => now,
        createSessionToken: () => "unused_session_token_with_more_than_40_chars_123",
      },
    ),
  ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
});

test("does not return an expired session", async () => {
  const repository = await registeredRepository();
  const token = "expired_session_token_with_more_than_40_characters_123";
  const user = await repository.findUserByEmail("muro@example.com");
  await repository.createSession(
    user!.id,
    hashSessionToken(token),
    new Date("2026-10-16T11:59:59Z"),
  );

  await expect(readSession(token, repository, now)).resolves.toBeNull();
});

test("logs out by deleting the hashed session token", async () => {
  const repository = await registeredRepository();
  const token = "logout_session_token_with_more_than_40_characters_123";
  const user = await repository.findUserByEmail("muro@example.com");
  await repository.createSession(
    user!.id,
    hashSessionToken(token),
    new Date("2026-11-01T00:00:00Z"),
  );

  await logoutSession(token, repository);

  await expect(readSession(token, repository, now)).resolves.toBeNull();
});
