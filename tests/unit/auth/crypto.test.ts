// @vitest-environment node

import {
  hashInviteCode,
  hashPassword,
  hashSessionToken,
  newSessionToken,
  verifyPassword,
} from "@/features/auth/crypto";

test("hashes and verifies passwords without retaining the plaintext", async () => {
  const password = "wardrobe-pass-2026";
  const passwordHash = await hashPassword(password);

  expect(passwordHash).not.toContain(password);
  expect(await verifyPassword(passwordHash, password)).toBe(true);
  expect(await verifyPassword(passwordHash, "incorrect-password")).toBe(false);
});

test("treats a malformed stored password hash as a failed verification", async () => {
  await expect(verifyPassword("not-an-argon2-hash", "password-value")).resolves.toBe(
    false,
  );
});

test("hashes invite codes with a pepper-specific HMAC", () => {
  const first = hashInviteCode(
    "invite-raw",
    "first-pepper-value-with-32-characters",
  );
  const second = hashInviteCode(
    "invite-raw",
    "second-pepper-value-with-32-characters",
  );

  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(first).not.toContain("invite-raw");
  expect(second).not.toBe(first);
});

test("creates URL-safe session tokens and hashes them with SHA-256", () => {
  const token = newSessionToken();

  expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  expect(hashSessionToken(token)).not.toContain(token);
});
