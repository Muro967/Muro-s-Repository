// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { migrateDatabase } from "@/server/db/migrate";

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const wardrobeA = "20000000-0000-4000-8000-000000000001";
const wardrobeB = "20000000-0000-4000-8000-000000000002";
const zoneA = "30000000-0000-4000-8000-000000000001";
const zoneB = "30000000-0000-4000-8000-000000000002";
const itemA = "40000000-0000-4000-8000-000000000001";
const itemB = "40000000-0000-4000-8000-000000000002";
const uploadA = "50000000-0000-4000-8000-000000000001";
const uploadB = "50000000-0000-4000-8000-000000000002";
let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  await migrateDatabase(drizzle({ client }));
  await client.exec(`
    insert into users (id, email, password_hash, name) values ('${a}', 'a@example.com', 'hash', 'A'), ('${b}', 'b@example.com', 'hash', 'B');
    insert into wardrobes (id, user_id, name) values ('${wardrobeA}', '${a}', 'A'), ('${wardrobeB}', '${b}', 'B');
    insert into zones (id, user_id, wardrobe_id, name, kind) values ('${zoneA}', '${a}', '${wardrobeA}', 'A', 'hang'), ('${zoneB}', '${b}', '${wardrobeB}', 'B', 'shoe');
    insert into items (id, user_id) values ('${itemA}', '${a}'), ('${itemB}', '${b}');
    insert into uploads (id, user_id, object_key, kind, content_type, size_bytes, status) values ('${uploadA}', '${a}', 'users/a/wardrobe-original/2026/10/a.jpg', 'wardrobe-original', 'image/jpeg', 1024, 'completed'), ('${uploadB}', '${b}', 'users/b/wardrobe-original/2026/10/b.jpg', 'wardrobe-original', 'image/jpeg', 1024, 'completed');
  `);
});

afterAll(async () => { await client.close(); });

test.each([
  ["zone wardrobe", `insert into zones (user_id, wardrobe_id, name, kind) values ('${a}', '${wardrobeB}', 'foreign', 'hang')`],
  ["item wardrobe", `insert into items (user_id, wardrobe_id) values ('${a}', '${wardrobeB}')`],
  ["item zone", `insert into items (user_id, wardrobe_id, zone_id) values ('${a}', '${wardrobeA}', '${zoneB}')`],
  ["asset item", `insert into item_assets (user_id, item_id, upload_id, role) values ('${a}', '${itemB}', '${uploadA}', 'original')`],
  ["asset upload", `insert into item_assets (user_id, item_id, upload_id, role) values ('${a}', '${itemA}', '${uploadB}', 'original')`],
  ["disposal item", `insert into disposal_records (user_id, item_id, method, disposed_on) values ('${a}', '${itemB}', 'donated', '2026-10-19')`],
])("rejects cross-tenant %s references at the database boundary", async (_name, query) => {
  await expect(client.exec(query)).rejects.toThrow(/foreign key constraint/);
});

test("rejects a same-user zone from a different wardrobe", async () => {
  const other = (await client.query<{ id: string }>(`insert into wardrobes (user_id, name) values ($1, 'Other') returning id`, [a])).rows[0]!.id;
  await expect(client.query(`insert into items (user_id, wardrobe_id, zone_id) values ($1, $2, $3)`, [a, other, zoneA])).rejects.toThrow(/foreign key constraint/);
});

test("allows partial drafts and complete inventory, and stores JSON arrays and integer money", async () => {
  const item = (await client.query<{ id: string }>(`insert into items (user_id, wardrobe_id, zone_id, status, name, category_id, color_names, style_ids, season_ids, added_on, manual_last_worn_on) values ($1, $2, $3, 'active', '白衬衫', 'tops', '["white"]', '["minimalist"]', '["summer"]', '2026-09-01', '2026-09-02') returning id`, [a, wardrobeA, zoneA])).rows[0]!.id;
  expect((await client.query(`select color_names, style_ids, season_ids from items where id = $1`, [item])).rows).toEqual([{ color_names: ["white"], style_ids: ["minimalist"], season_ids: ["summer"] }]);
  await client.query(`update items set status = 'disposed' where id = $1`, [item]);
  await client.query(`insert into disposal_records (user_id, item_id, method, disposed_on, sale_amount_minor) values ($1, $2, 'sold', '2026-10-19', 12345)`, [a, item]);
  expect((await client.query(`select sale_amount_minor from disposal_records where item_id = $1`, [item])).rows).toEqual([{ sale_amount_minor: 12345 }]);
  await expect(client.query(`insert into disposal_records (user_id, item_id, method, disposed_on) values ($1, $2, 'donated', '2026-10-19')`, [a, item])).rejects.toThrow(/unique constraint/);
});

test("binds an original once per item and an upload to at most one item", async () => {
  await client.query(`insert into item_assets (user_id, item_id, upload_id, role) values ($1, $2, $3, 'original')`, [a, itemA, uploadA]);
  const second = (await client.query<{ id: string }>(`insert into items (user_id) values ($1) returning id`, [a])).rows[0]!.id;
  await expect(client.query(`insert into item_assets (user_id, item_id, upload_id, role) values ($1, $2, $3, 'original')`, [a, second, uploadA])).rejects.toThrow(/unique constraint/);
  const upload = (await client.query<{ id: string }>(`insert into uploads (user_id, object_key, kind, content_type, size_bytes, status) values ($1, 'other.jpg', 'wardrobe-original', 'image/jpeg', 1024, 'completed') returning id`, [a])).rows[0]!.id;
  await expect(client.query(`insert into item_assets (user_id, item_id, upload_id, role) values ($1, $2, $3, 'original')`, [a, itemA, upload])).rejects.toThrow(/unique constraint/);
});

test("retains containers while items reference them and cascades inventory on user deletion", async () => {
  const user = (await client.query<{ id: string }>(`insert into users (email, password_hash, name) values ('delete@example.com', 'hash', 'Delete') returning id`)).rows[0]!.id;
  const wardrobe = (await client.query<{ id: string }>(`insert into wardrobes (user_id, name) values ($1, 'Delete') returning id`, [user])).rows[0]!.id;
  const zone = (await client.query<{ id: string }>(`insert into zones (user_id, wardrobe_id, name, kind) values ($1, $2, 'Delete', 'shelf') returning id`, [user, wardrobe])).rows[0]!.id;
  await client.query(`insert into items (user_id, wardrobe_id, zone_id, name, category_id, status, added_on, watch_started_on, watch_due_on) values ($1, $2, $3, '外套', 'outerwear', 'watching', '2026-01-01', '2026-10-01', '2026-10-31')`, [user, wardrobe, zone]);
  await expect(client.query(`delete from zones where id = $1`, [zone])).rejects.toThrow(/foreign key constraint/);
  await expect(client.query(`delete from wardrobes where id = $1`, [wardrobe])).rejects.toThrow(/foreign key constraint/);
  await client.query(`delete from users where id = $1`, [user]);
  expect((await client.query(`select (select count(*) from zones where user_id = $1)::int + (select count(*) from items where user_id = $1)::int as count`, [user])).rows).toEqual([{ count: 0 }]);
});

test.each([
  ["active without location", `insert into items (user_id, status, name, category_id, added_on) values ('${a}', 'active', 'Shirt', 'tops', '2026-10-01')`],
  ["active without added date", `insert into items (user_id, status, name, category_id, wardrobe_id, zone_id) values ('${a}', 'active', 'Shirt', 'tops', '${wardrobeA}', '${zoneA}')`],
  ["disposed without location", `insert into items (user_id, status, name, category_id, added_on) values ('${a}', 'disposed', 'Shirt', 'tops', '2026-10-01')`],
  ["zone without wardrobe", `insert into items (user_id, zone_id) values ('${a}', '${zoneA}')`],
  ["unknown status", `insert into items (user_id, status) values ('${a}', 'lost')`],
  ["unknown category", `insert into items (user_id, category_id) values ('${a}', 'other')`],
  ["watching without dates", `insert into items (user_id, status, name, category_id, added_on, wardrobe_id, zone_id) values ('${a}', 'watching', 'Shirt', 'tops', '2026-10-01', '${wardrobeA}', '${zoneA}')`],
  ["watch end before start", `insert into items (user_id, status, name, category_id, added_on, wardrobe_id, zone_id, watch_started_on, watch_due_on) values ('${a}', 'watching', 'Shirt', 'tops', '2026-10-01', '${wardrobeA}', '${zoneA}', '2026-10-10', '2026-10-09')`],
  ["watch dates outside watching status", `insert into items (user_id, watch_started_on, watch_due_on) values ('${a}', '2026-10-01', '2026-10-10')`],
  ["invalid JSON array shape", `insert into items (user_id, color_names) values ('${a}', '{"white":true}')`],
  ["invalid style", `insert into items (user_id, style_ids) values ('${a}', '["made-up"]')`],
  ["invalid season", `insert into items (user_id, season_ids) values ('${a}', '["monsoon"]')`],
  ["unknown zone kind", `insert into zones (user_id, wardrobe_id, name, kind) values ('${a}', '${wardrobeA}', 'X', 'box')`],
  ["unknown upload kind", `insert into uploads (user_id, object_key, kind, content_type, size_bytes, status) values ('${a}', 'x', 'unknown', 'image/jpeg', 1, 'pending')`],
  ["nonpositive idle days", `insert into user_settings (user_id, idle_days) values ('${a}', 0)`],
  ["nonpositive watch days", `insert into user_settings (user_id, watch_days) values ('${a}', -1)`],
  ["idle days above maximum", `insert into user_settings (user_id, idle_days) values ('${a}', 3651)`],
  ["watch days above maximum", `insert into user_settings (user_id, watch_days) values ('${a}', 366)`],
  ["negative zone sort order", `insert into zones (user_id, wardrobe_id, name, kind, sort_order) values ('${a}', '${wardrobeA}', 'X', 'hang', -1)`],
  ["invalid accessory", `insert into items (user_id, accessory_id) values ('${a}', 'unknown')`],
  ["invalid asset role", `insert into item_assets (user_id, item_id, upload_id, role) values ('${b}', '${itemB}', '${uploadB}', 'thumbnail')`],
  ["invalid disposal method", `insert into disposal_records (user_id, item_id, method, disposed_on) values ('${a}', '${itemA}', 'lost', '2026-10-19')`],
  ["invalid season override", `insert into user_settings (user_id, season_override) values ('${a}', 'monsoon')`],
  ["negative disposal amount", `insert into disposal_records (user_id, item_id, method, disposed_on, sale_amount_minor) values ('${a}', '${itemA}', 'sold', '2026-10-19', -1)`],
])("rejects %s", async (_name, query) => {
  await expect(client.exec(query)).rejects.toThrow(/check constraint/);
});
