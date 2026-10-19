import { sql, type SQLWrapper } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accessorySubcategories, itemCategories, itemStyles, seasons } from "../../features/items/item-catalog";
import { itemStatuses, type AccessoryId, type CategoryId, type ItemStatus, type SeasonId, type StyleId } from "../../features/items/item-types";
import type { UploadKind } from "../../features/storage/storage-provider";
import { zoneKinds, type ZoneKind } from "../../features/wardrobe/wardrobe-types";

// Only compile-time catalog values are rendered as literals in DDL constraints.
function enumValues(column: SQLWrapper, values: readonly string[]) {
  return sql`${column} in (${sql.join(values.map((value) => sql.raw(`'${value}'`)), sql`, `)})`;
}

function jsonArrayValues(column: SQLWrapper, values: readonly string[]) {
  return sql`jsonb_typeof(${column}) = 'array' and ${column} <@ ${sql.raw(`'${JSON.stringify(values)}'::jsonb`)}`;
}

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull(),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invite_codes_hash_unique").on(table.codeHash),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_index").on(table.userId),
  ],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  city: text("city").notNull().default(""),
  hairLength: text("hair_length").notNull().default(""),
  hairTexture: text("hair_texture").notNull().default(""),
  idleDays: integer("idle_days").notNull().default(90),
  watchDays: integer("watch_days").notNull().default(30),
  timeZone: text("time_zone").notNull().default("UTC"),
  seasonOverride: text("season_override").$type<SeasonId>(),
}, (table) => [
  check("user_settings_idle_days_check", sql`${table.idleDays} between 1 and 3650`),
  check("user_settings_watch_days_check", sql`${table.watchDays} between 1 and 365`),
  check("user_settings_season_override_check", enumValues(table.seasonOverride, seasons.map(({ id }) => id))),
]);

export const wardrobes = pgTable(
  "wardrobes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wardrobes_user_id_index").on(table.userId),
    uniqueIndex("wardrobes_user_id_id_unique").on(table.userId, table.id),
  ],
);

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    kind: text("kind").$type<UploadKind>().notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("uploads_user_id_index").on(table.userId),
    uniqueIndex("uploads_user_id_id_unique").on(table.userId, table.id),
    check("uploads_kind_check", enumValues(table.kind, ["wardrobe-original", "inspiration", "wear-photo"])),
  ],
);

export const zones = pgTable("zones", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wardrobeId: uuid("wardrobe_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").$type<ZoneKind>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("zones_user_id_id_unique").on(table.userId, table.id),
  uniqueIndex("zones_user_wardrobe_id_unique").on(table.userId, table.wardrobeId, table.id),
  foreignKey({ name: "zones_tenant_wardrobe_fk", columns: [table.userId, table.wardrobeId], foreignColumns: [wardrobes.userId, wardrobes.id] }),
  check("zones_kind_check", enumValues(table.kind, zoneKinds)),
  check("zones_sort_order_check", sql`${table.sortOrder} >= 0`),
]);

export const items = pgTable("items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wardrobeId: uuid("wardrobe_id"),
  zoneId: uuid("zone_id"),
  name: text("name").notNull().default(""),
  categoryId: text("category_id").$type<CategoryId>(),
  accessoryId: text("accessory_id").$type<AccessoryId>(),
  colorNames: jsonb("color_names").$type<string[]>().notNull().default([]),
  colorHexes: jsonb("color_hexes").$type<string[]>().notNull().default([]),
  styleIds: jsonb("style_ids").$type<StyleId[]>().notNull().default([]),
  seasonIds: jsonb("season_ids").$type<SeasonId[]>().notNull().default([]),
  thickness: text("thickness"),
  material: text("material"),
  fit: text("fit"),
  length: text("length"),
  formality: text("formality"),
  brand: text("brand"),
  notes: text("notes"),
  status: text("status").$type<ItemStatus>().notNull().default("draft"),
  addedOn: date("added_on"),
  manualLastWornOn: date("manual_last_worn_on"),
  watchStartedOn: date("watch_started_on"),
  watchDueOn: date("watch_due_on"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("items_user_id_id_unique").on(table.userId, table.id),
  foreignKey({ name: "items_tenant_wardrobe_fk", columns: [table.userId, table.wardrobeId], foreignColumns: [wardrobes.userId, wardrobes.id] }),
  foreignKey({ name: "items_tenant_zone_fk", columns: [table.userId, table.wardrobeId, table.zoneId], foreignColumns: [zones.userId, zones.wardrobeId, zones.id] }),
  check("items_status_check", enumValues(table.status, itemStatuses)),
  check("items_category_check", enumValues(table.categoryId, itemCategories.map(({ id }) => id))),
  check("items_accessory_check", enumValues(table.accessoryId, accessorySubcategories.map(({ id }) => id))),
  check("items_color_names_check", sql`jsonb_typeof(${table.colorNames}) = 'array'`),
  check("items_color_hexes_check", sql`jsonb_typeof(${table.colorHexes}) = 'array'`),
  check("items_style_ids_check", jsonArrayValues(table.styleIds, itemStyles.map(({ id }) => id))),
  check("items_season_ids_check", jsonArrayValues(table.seasonIds, seasons.map(({ id }) => id))),
  check("items_zone_requires_wardrobe_check", sql`${table.zoneId} is null or ${table.wardrobeId} is not null`),
  check("items_complete_metadata_check", sql`${table.status} = 'draft' or (${table.wardrobeId} is not null and ${table.zoneId} is not null and length(trim(${table.name})) > 0 and ${table.categoryId} is not null and ${table.addedOn} is not null)`),
  check("items_watch_dates_check", sql`(${table.status} = 'watching' and ${table.watchStartedOn} is not null and ${table.watchDueOn} is not null and ${table.watchDueOn} >= ${table.watchStartedOn}) or (${table.status} <> 'watching' and ${table.watchStartedOn} is null and ${table.watchDueOn} is null)`),
]);

export const itemAssets = pgTable("item_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull(),
  uploadId: uuid("upload_id").notNull(),
  role: text("role").$type<"original">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "item_assets_tenant_item_fk", columns: [table.userId, table.itemId], foreignColumns: [items.userId, items.id] }).onDelete("cascade"),
  foreignKey({ name: "item_assets_tenant_upload_fk", columns: [table.userId, table.uploadId], foreignColumns: [uploads.userId, uploads.id] }),
  uniqueIndex("item_assets_item_role_unique").on(table.itemId, table.role),
  uniqueIndex("item_assets_upload_unique").on(table.uploadId),
  check("item_assets_role_check", sql`${table.role} = 'original'`),
]);

export const disposalRecords = pgTable("disposal_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull(),
  method: text("method").$type<"sold" | "gifted" | "donated" | "recycled" | "upcycled" | "discarded">().notNull(),
  disposedOn: date("disposed_on").notNull(),
  saleAmountMinor: integer("sale_amount_minor"),
  currency: text("currency"),
  platform: text("platform"),
  recipient: text("recipient"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "disposal_records_tenant_item_fk", columns: [table.userId, table.itemId], foreignColumns: [items.userId, items.id] }).onDelete("cascade"),
  uniqueIndex("disposal_records_item_unique").on(table.itemId),
  check("disposal_records_method_check", enumValues(table.method, ["sold", "gifted", "donated", "recycled", "upcycled", "discarded"])),
  check("disposal_records_amount_check", sql`${table.saleAmountMinor} >= 0`),
]);

export const schema = {
  users,
  inviteCodes,
  sessions,
  userSettings,
  wardrobes,
  uploads,
  zones,
  items,
  itemAssets,
  disposalRecords,
};
