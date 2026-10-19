// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { AuthError } from "@/features/auth/auth-errors";
import { migrateDatabase } from "@/server/db/migrate";
import { DrizzleAuthRepository } from "@/server/db/drizzle-auth-repository";
import { schema } from "@/server/db/schema";

async function testRepository() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrateDatabase(db);
  return { client, repository: new DrizzleAuthRepository(db) };
}

const registration = {
  inviteHash: "a".repeat(64),
  email: "muro@example.com",
  passwordHash: "$argon2id$stored-password-hash",
  name: "Muro",
  sessionHash: "b".repeat(64),
  sessionExpiresAt: new Date("2026-11-15T12:00:00Z"),
  now: new Date("2026-10-16T12:00:00Z"),
};

test("registers the user, settings, default wardrobe and zone, and session in one transaction", async () => {
  const { client, repository } = await testRepository();
  try {
    await repository.createInvite({
      codeHash: registration.inviteHash,
      maxUses: 1,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });

    const user = await repository.register(registration);
    const records = await client.query<{
      use_count: number;
      settings_count: number;
      wardrobe_name: string;
      zone_name: string;
      zone_kind: string;
      session_hash: string;
    }>(`
      select
        (select use_count from invite_codes limit 1)::int as use_count,
        (select count(*) from user_settings where user_id = $1)::int as settings_count,
        (select name from wardrobes where user_id = $1 limit 1) as wardrobe_name,
        (select z.name from zones z join wardrobes w on w.id = z.wardrobe_id and w.user_id = z.user_id where z.user_id = $1) as zone_name,
        (select kind from zones where user_id = $1) as zone_kind,
        (select token_hash from sessions where user_id = $1 limit 1) as session_hash
    `, [user.id]);

    expect(user).toMatchObject({
      email: "muro@example.com",
      name: "Muro",
      onboardingComplete: false,
    });
    expect(records.rows[0]).toEqual({
      use_count: 1,
      settings_count: 1,
      wardrobe_name: "我的衣柜",
      zone_name: "默认挂衣区",
      zone_kind: "hang",
      session_hash: registration.sessionHash,
    });
  } finally {
    await client.close();
  }
});

test("rolls back every registration write when an invite is invalid", async () => {
  const { client, repository } = await testRepository();
  try {
    await repository.createInvite({
      codeHash: registration.inviteHash,
      maxUses: 1,
      expiresAt: new Date("2026-10-16T11:59:59Z"),
    });

    await expect(repository.register(registration)).rejects.toEqual(
      new AuthError("INVALID_INVITE"),
    );
    const counts = await client.query<{ total: number }>(`
      select (
        (select count(*) from users) +
        (select count(*) from user_settings) +
        (select count(*) from wardrobes) +
        (select count(*) from zones) +
        (select count(*) from sessions)
      )::int as total
    `);
    expect(counts.rows[0]?.total).toBe(0);
  } finally {
    await client.close();
  }
});

test("maps a duplicate normalized email and rolls back invite consumption", async () => {
  const { client, repository } = await testRepository();
  try {
    await repository.createInvite({
      codeHash: registration.inviteHash,
      maxUses: 2,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    await repository.register(registration);

    await expect(
      repository.register({
        ...registration,
        sessionHash: "d".repeat(64),
      }),
    ).rejects.toEqual(new AuthError("EMAIL_ALREADY_REGISTERED"));
    const invite = await client.query<{ use_count: number }>(
      "select use_count from invite_codes limit 1",
    );
    expect(invite.rows[0]?.use_count).toBe(1);
  } finally {
    await client.close();
  }
});

test("sanitizes unexpected transaction errors and rolls back every write", async () => {
  const { client, repository } = await testRepository();
  const secondInviteHash = "e".repeat(64);
  try {
    await repository.createInvite({
      codeHash: registration.inviteHash,
      maxUses: 1,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    await repository.register(registration);
    await repository.createInvite({
      codeHash: secondInviteHash,
      maxUses: 1,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });

    const failedRegistration = repository.register({
      ...registration,
      inviteHash: secondInviteHash,
      email: "second@example.com",
    });
    await expect(failedRegistration).rejects.toThrow(
      "Authentication persistence failed",
    );
    await expect(failedRegistration).rejects.not.toThrow(
      registration.sessionHash,
    );

    const state = await client.query<{ users: number; uses: number; wardrobes: number; zones: number }>(`
      select
        (select count(*) from users)::int as users,
        (select count(*) from wardrobes)::int as wardrobes,
        (select count(*) from zones)::int as zones,
        (select use_count from invite_codes where code_hash = $1)::int as uses
    `, [secondInviteHash]);
    expect(state.rows[0]).toEqual({ users: 1, uses: 0, wardrobes: 1, zones: 1 });
  } finally {
    await client.close();
  }
});

test("does not expose a session hash when standalone session creation fails", async () => {
  const { client, repository } = await testRepository();
  try {
    await repository.createInvite({
      codeHash: registration.inviteHash,
      maxUses: 1,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    const user = await repository.register(registration);

    const failedCreation = repository.createSession(
      user.id,
      registration.sessionHash,
      registration.sessionExpiresAt,
    );
    await expect(failedCreation).rejects.toThrow("Session persistence failed");
    await expect(failedCreation).rejects.not.toThrow(registration.sessionHash);
  } finally {
    await client.close();
  }
});

test("does not expose a session hash when session lookup or deletion fails", async () => {
  const { client, repository } = await testRepository();
  const secretHash = "f".repeat(64);
  await client.close();

  const failedLookup = repository.findSession(secretHash, registration.now);
  await expect(failedLookup).rejects.toThrow("Session lookup failed");
  await expect(failedLookup).rejects.not.toThrow(secretHash);

  const failedDeletion = repository.deleteSession(secretHash);
  await expect(failedDeletion).rejects.toThrow("Session deletion failed");
  await expect(failedDeletion).rejects.not.toThrow(secretHash);
});

test("allows only one concurrent registration to consume a single-use invite", async () => {
  const { client, repository } = await testRepository();
  try {
    await repository.createInvite({
      codeHash: registration.inviteHash,
      maxUses: 1,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });

    const results = await Promise.allSettled([
      repository.register(registration),
      repository.register({
        ...registration,
        email: "second@example.com",
        sessionHash: "c".repeat(64),
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const counts = await client.query<{ users: number; uses: number }>(`
      select
        (select count(*) from users)::int as users,
        (select use_count from invite_codes limit 1)::int as uses
    `);
    expect(counts.rows[0]).toEqual({ users: 1, uses: 1 });
  } finally {
    await client.close();
  }
});
