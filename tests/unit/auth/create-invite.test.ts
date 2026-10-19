// @vitest-environment node
import { hashInviteCode } from "@/features/auth/crypto";
import { createInvitation } from "@/features/auth/create-invitation";

test("creates a limited invitation while persisting only its HMAC", async () => {
  let stored: unknown;
  const code = await createInvitation({ uses: 2, days: 3 }, {
    repository: { async createInvite(input) { stored = input; } },
    pepper: "test-pepper-with-at-least-32-characters",
    now: new Date("2026-10-18T00:00:00Z"),
    generateCode: () => "raw-invite-only-returned-once",
  });
  expect(code).toBe("raw-invite-only-returned-once");
  expect(stored).toEqual({ codeHash: hashInviteCode(code, "test-pepper-with-at-least-32-characters"), maxUses: 2, expiresAt: new Date("2026-10-21T00:00:00Z") });
  expect(JSON.stringify(stored)).not.toContain(code);
});

test("does not expose database details when invitation persistence fails", async () => {
  await expect(createInvitation({ uses: 1, days: 1 }, {
    repository: { async createInvite() { throw new Error("database query with private bound values"); } },
    pepper: "test-pepper-with-at-least-32-characters",
  })).rejects.toThrow(/^Invitation creation failed$/);
});
