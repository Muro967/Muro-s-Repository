// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdtemp, readFile, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrateDatabase } from "@/server/db/migrate";

async function phaseOneDatabase() {
  const folder = await mkdtemp(join(tmpdir(), "wardrobe-phase-one-"));
  const client = new PGlite();
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    await copyFile("drizzle/0000_foundation.sql", join(folder, "0000_foundation.sql"));
    await migrate(drizzle({ client }), { migrationsFolder: folder });
    await client.exec(`
      insert into users (id, email, password_hash, name) values ('10000000-0000-4000-8000-000000000001', 'old@example.com', 'hash', 'Old user');
      insert into user_settings (user_id, city) values ('10000000-0000-4000-8000-000000000001', '上海');
      insert into wardrobes (user_id, name) values ('10000000-0000-4000-8000-000000000001', '旧衣柜'), ('10000000-0000-4000-8000-000000000001', '旅行衣柜');
    `);
    return client;
  } catch (error) {
    await client.close();
    throw error;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test("upgrades phase-one users and every wardrobe in place, without duplicating defaults on rerun", async () => {
  const client = await phaseOneDatabase();
  try {
    for (const kind of ["wardrobe-original", "inspiration", "wear-photo"]) {
      await client.query(`insert into uploads (user_id, object_key, content_type, size_bytes, status) values ($1, $2, 'image/jpeg', 1024, 'pending')`, [
        "10000000-0000-4000-8000-000000000001",
        `users/10000000-0000-4000-8000-000000000001/${kind}/2026/10/20000000-0000-4000-8000-000000000001.jpg`,
      ]);
    }
    await migrateDatabase(drizzle({ client }));
    await migrateDatabase(drizzle({ client }));
    expect((await client.query(`select email, name from users`)).rows).toEqual([{ email: "old@example.com", name: "Old user" }]);
    expect((await client.query(`select w.name, z.name as zone_name, z.kind from wardrobes w join zones z on z.wardrobe_id = w.id and z.user_id = w.user_id order by w.name`)).rows).toEqual([
      { name: "旅行衣柜", zone_name: "默认挂衣区", kind: "hang" },
      { name: "旧衣柜", zone_name: "默认挂衣区", kind: "hang" },
    ]);
    expect((await client.query(`select city, idle_days, watch_days, time_zone, season_override from user_settings`)).rows).toEqual([
      { city: "上海", idle_days: 90, watch_days: 30, time_zone: "UTC", season_override: null },
    ]);
    expect((await client.query(`select kind from uploads order by kind`)).rows).toEqual([
      { kind: "inspiration" }, { kind: "wardrobe-original" }, { kind: "wear-photo" },
    ]);
  } finally {
    await client.close();
  }
});

test("fails an upgrade explicitly for unclassifiable legacy upload keys and preserves the phase-one data", async () => {
  const client = await phaseOneDatabase();
  try {
    await client.query(`insert into uploads (user_id, object_key, content_type, size_bytes, status) values ($1, 'users/old/unknown/item.jpg', 'image/jpeg', 1024, 'pending')`, ["10000000-0000-4000-8000-000000000001"]);
    await expect(migrateDatabase(drizzle({ client }))).rejects.toThrow(/Cannot classify legacy upload object key/);
    expect((await client.query(`select object_key from uploads`)).rows).toEqual([{ object_key: "users/old/unknown/item.jpg" }]);
    expect((await client.query(`select count(*)::int as count from users`)).rows).toEqual([{ count: 1 }]);
    expect((await client.query(`select count(*)::int as count from information_schema.columns where table_name = 'uploads' and column_name = 'kind'`)).rows).toEqual([{ count: 0 }]);
  } finally {
    await client.close();
  }
});
