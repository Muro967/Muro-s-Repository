// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { migrateDatabase } from "@/server/db/migrate";

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const uploadA = "20000000-0000-4000-8000-000000000001";
const uploadB = "20000000-0000-4000-8000-000000000002";
const itemA = "30000000-0000-4000-8000-000000000001";
const itemB = "30000000-0000-4000-8000-000000000002";
let client: PGlite;
let inspirationA!: string;
let recreationA!: string;

beforeAll(async () => {
  client = new PGlite();
  await migrateDatabase(drizzle({ client }));
  await client.exec(`
    insert into users (id, email, password_hash, name) values
      ('${userA}', 'phase3-a@example.com', 'hash', 'A'),
      ('${userB}', 'phase3-b@example.com', 'hash', 'B');
    insert into uploads (id, user_id, object_key, kind, content_type, size_bytes, status) values
      ('${uploadA}', '${userA}', 'users/a/inspiration/a.jpg', 'inspiration', 'image/jpeg', 1024, 'completed'),
      ('${uploadB}', '${userB}', 'users/b/inspiration/b.jpg', 'inspiration', 'image/jpeg', 1024, 'completed');
    insert into items (id, user_id) values
      ('${itemA}', '${userA}'),
      ('${itemB}', '${userB}');
  `);
  inspirationA = (await client.query<{ id: string }>(
    "insert into inspirations (user_id, upload_id, name, style_tags, color_names) values ($1, $2, '秋日通勤', '[\"法式\"]', '[\"米白\"]') returning id",
    [userA, uploadA],
  )).rows[0]!.id;
  recreationA = (await client.query<{ id: string }>(
    "insert into inspiration_recreations (user_id, inspiration_id, input_snapshot) values ($1, $2, '{}') returning id",
    [userA, inspirationA],
  )).rows[0]!.id;
});

afterAll(async () => {
  await client.close();
});

test("stores the phase-three domain and preserves typed JSON data", async () => {
  await client.query(
    "insert into style_profiles (user_id, preferred_colors, preferred_silhouettes, common_combinations, liked_examples, input_version) values ($1, '[\"米白\"]', '[\"宽松\"]', '[\"衬衫+长裤\"]', $2, 'v1')",
    [userA, JSON.stringify([inspirationA])],
  );
  await client.query(
    "insert into style_rules (user_id, type, value) values ($1, 'color', '偏爱低饱和色')",
    [userA],
  );
  await client.query(
    "insert into inspiration_recreation_items (user_id, recreation_id, item_id, slot, sort_order) values ($1, $2, $3, '上装', 0)",
    [userA, recreationA, itemA],
  );
  await client.query(
    "insert into processing_jobs (user_id, type, target_inspiration_id, input_version) values ($1, 'inspiration-analysis', $2, 1)",
    [userA, inspirationA],
  );

  expect((await client.query(
    "select name, style_tags, color_names, analysis_status, version from inspirations where id = $1",
    [inspirationA],
  )).rows).toEqual([{
    name: "秋日通勤",
    style_tags: ["法式"],
    color_names: ["米白"],
    analysis_status: "manual",
    version: 1,
  }]);
});

test.each([
  ["inspiration upload", () => client.query(
    "insert into inspirations (user_id, upload_id) values ($1, $2)",
    [userA, uploadB],
  )],
  ["recreation source", () => client.query(
    "insert into inspiration_recreations (user_id, inspiration_id, input_snapshot) values ($1, $2, '{}')",
    [userB, inspirationA],
  )],
  ["recreation item", () => client.query(
    "insert into inspiration_recreation_items (user_id, recreation_id, item_id, slot, sort_order) values ($1, $2, $3, '上装', 1)",
    [userA, recreationA, itemB],
  )],
])("rejects cross-tenant %s references at the database boundary", async (_name, operation) => {
  await expect(operation()).rejects.toThrow(/foreign key constraint/);
});

test("binds an upload to at most one inspiration", async () => {
  await expect(client.query(
    "insert into inspirations (user_id, upload_id) values ($1, $2)",
    [userA, uploadA],
  )).rejects.toThrow(/unique constraint/);
});

test.each([
  ["unknown analysis status", () => client.query("update inspirations set analysis_status = 'invented' where id = $1", [inspirationA])],
  ["non-array style tags", () => client.query("update inspirations set style_tags = '{\"法式\":true}' where id = $1", [inspirationA])],
  ["version zero", () => client.query("update inspirations set version = 0 where id = $1", [inspirationA])],
  ["unknown style rule type", () => client.query("insert into style_rules (user_id, type, value) values ($1, 'occasion', '通勤')", [userA])],
  ["unknown recreation mode", () => client.query("update inspiration_recreations set mode = 'magic' where id = $1", [recreationA])],
  ["unknown job status", () => client.query("insert into processing_jobs (user_id, type, target_inspiration_id, input_version, status) values ($1, 'inspiration-analysis', $2, 1, 'paused')", [userA, inspirationA])],
  ["unknown job type", () => client.query("insert into processing_jobs (user_id, type, target_inspiration_id, input_version) values ($1, 'wardrobe-analysis', $2, 1)", [userA, inspirationA])],
  ["attempts above maximum", () => client.query("insert into processing_jobs (user_id, type, target_inspiration_id, input_version, attempts) values ($1, 'inspiration-analysis', $2, 1, 3)", [userA, inspirationA])],
])("rejects %s", async (_name, operation) => {
  await expect(operation()).rejects.toThrow(/check constraint/);
});

test("soft-deleted inspirations retain their private upload relation", async () => {
  await client.query("update inspirations set deleted_at = now() where id = $1", [inspirationA]);
  expect((await client.query(
    "select i.upload_id, u.object_key from inspirations i join uploads u on u.id = i.upload_id and u.user_id = i.user_id where i.id = $1",
    [inspirationA],
  )).rows).toEqual([{ upload_id: uploadA, object_key: "users/a/inspiration/a.jpg" }]);
});

test("deleting a user cascades all phase-three records", async () => {
  const user = (await client.query<{ id: string }>(
    "insert into users (email, password_hash, name) values ('phase3-delete@example.com', 'hash', 'Delete') returning id",
  )).rows[0]!.id;
  const upload = (await client.query<{ id: string }>(
    "insert into uploads (user_id, object_key, kind, content_type, size_bytes, status) values ($1, 'users/delete/inspiration/a.jpg', 'inspiration', 'image/jpeg', 1, 'completed') returning id",
    [user],
  )).rows[0]!.id;
  const inspiration = (await client.query<{ id: string }>(
    "insert into inspirations (user_id, upload_id) values ($1, $2) returning id",
    [user, upload],
  )).rows[0]!.id;
  await client.query("insert into style_profiles (user_id, input_version) values ($1, 'v1')", [user]);
  await client.query("insert into style_rules (user_id, type, value) values ($1, 'text', '保留')", [user]);
  await client.query(
    "insert into processing_jobs (user_id, type, target_inspiration_id, input_version) values ($1, 'inspiration-analysis', $2, 1)",
    [user, inspiration],
  );

  await client.query("delete from users where id = $1", [user]);
  expect((await client.query(
    "select (select count(*) from inspirations where user_id = $1)::int + (select count(*) from style_profiles where user_id = $1)::int + (select count(*) from style_rules where user_id = $1)::int + (select count(*) from processing_jobs where user_id = $1)::int as count",
    [user],
  )).rows).toEqual([{ count: 0 }]);
});
