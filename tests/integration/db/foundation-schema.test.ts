// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { migrateDatabase } from "@/server/db/migrate";
import {
  inviteCodes,
  sessions,
  uploads,
  users,
  userSettings,
  wardrobes,
} from "@/server/db/schema";

test("creates the complete phase-one foundation in Postgres", async () => {
  const client = new PGlite();
  const db = drizzle({ client });

  try {
    await migrateDatabase(db);

    const result = await client.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);

    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "invite_codes",
      "sessions",
      "uploads",
      "user_settings",
      "users",
      "wardrobes",
    ]);
    expect(users).toBeDefined();
    expect(inviteCodes).toBeDefined();
    expect(sessions).toBeDefined();
    expect(userSettings).toBeDefined();
    expect(wardrobes).toBeDefined();
    expect(uploads).toBeDefined();
  } finally {
    await client.close();
  }
});

test("enforces auth uniqueness and cascades every user-owned record", async () => {
  const client = new PGlite();
  const db = drizzle({ client });

  try {
    await migrateDatabase(db);
    const createdUser = await client.query<{ id: string }>(`
      insert into users (email, password_hash, name)
      values ('muro@example.com', 'hash', 'Muro')
      returning id
    `);
    const userId = createdUser.rows[0]?.id;

    expect(userId).toBeDefined();
    await expect(
      client.query(`
        insert into users (email, password_hash, name)
        values ('muro@example.com', 'another-hash', 'Duplicate')
      `),
    ).rejects.toThrow();

    await client.query(
      `insert into invite_codes (code_hash, expires_at) values ($1, $2)`,
      ["invite-hash", new Date("2030-01-01T00:00:00Z")],
    );
    await expect(
      client.query(
        `insert into invite_codes (code_hash, expires_at) values ($1, $2)`,
        ["invite-hash", new Date("2030-01-02T00:00:00Z")],
      ),
    ).rejects.toThrow();

    await client.query(
      `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
      [userId, "token-hash", new Date("2030-01-01T00:00:00Z")],
    );
    await expect(
      client.query(
        `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
        [userId, "token-hash", new Date("2030-01-02T00:00:00Z")],
      ),
    ).rejects.toThrow();

    await client.query(
      `insert into user_settings (user_id, city, hair_length, hair_texture)
       values ($1, '上海', 'medium', 'straight')`,
      [userId],
    );
    await client.query(
      `insert into wardrobes (user_id, name, sort_order)
       values ($1, '日常衣柜', 0)`,
      [userId],
    );
    await client.query(
      `insert into uploads (user_id, object_key, content_type, size_bytes, status)
       values ($1, 'users/muro/item.jpg', 'image/jpeg', 1024, 'pending')`,
      [userId],
    );

    await client.query(`delete from users where id = $1`, [userId]);
    const remaining = await client.query<{ record_count: number }>(`
      select (
        (select count(*) from sessions) +
        (select count(*) from user_settings) +
        (select count(*) from wardrobes) +
        (select count(*) from uploads)
      )::int as record_count
    `);

    expect(remaining.rows[0]?.record_count).toBe(0);
  } finally {
    await client.close();
  }
});
