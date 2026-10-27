// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrateDatabase } from "@/server/db/migrate";

async function phaseTwoDatabase() {
  const folder = await mkdtemp(join(tmpdir(), "wardrobe-phase-two-"));
  const client = new PGlite();
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }));
    await copyFile("drizzle/0000_foundation.sql", join(folder, "0000_foundation.sql"));
    await copyFile("drizzle/0001_inventory_idle.sql", join(folder, "0001_inventory_idle.sql"));
    await migrate(drizzle({ client }), { migrationsFolder: folder });
    await client.exec(`
      insert into users (id, email, password_hash, name) values
        ('10000000-0000-4000-8000-000000000001', 'legacy@example.com', 'hash', 'Legacy');
      insert into user_settings (user_id, city) values
        ('10000000-0000-4000-8000-000000000001', '上海');
      insert into wardrobes (id, user_id, name) values
        ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '旧衣柜');
      insert into zones (id, user_id, wardrobe_id, name, kind) values
        ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '默认挂衣区', 'hang');
      insert into items (id, user_id, wardrobe_id, zone_id, name, category_id, status, added_on) values
        ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '旧衬衫', 'tops', 'active', '2026-01-01');
      insert into uploads (id, user_id, object_key, kind, content_type, size_bytes, status) values
        ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'users/legacy/inspiration/a.jpg', 'inspiration', 'image/jpeg', 1024, 'completed');
    `);
    return client;
  } catch (error) {
    await client.close();
    throw error;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test("upgrades phase-two data in place and remains idempotent", async () => {
  const client = await phaseTwoDatabase();
  try {
    await migrateDatabase(drizzle({ client }));
    await migrateDatabase(drizzle({ client }));

    expect((await client.query(
      "select u.email, s.city, w.name as wardrobe, i.name as item, p.kind from users u join user_settings s on s.user_id = u.id join wardrobes w on w.user_id = u.id join items i on i.user_id = u.id join uploads p on p.user_id = u.id",
    )).rows).toEqual([{
      email: "legacy@example.com",
      city: "上海",
      wardrobe: "旧衣柜",
      item: "旧衬衫",
      kind: "inspiration",
    }]);

    for (const table of [
      "inspirations",
      "style_profiles",
      "style_rules",
      "inspiration_recreations",
      "inspiration_recreation_items",
      "processing_jobs",
    ]) {
      expect((await client.query(`select count(*)::int as count from ${table}`)).rows).toEqual([{ count: 0 }]);
    }
  } finally {
    await client.close();
  }
});
