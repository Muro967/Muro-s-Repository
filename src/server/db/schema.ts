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
  check("items_complete_metadata_check", sql`${table.status} = 'draft' or (${table.wardrobeId} is not null and ${table.zoneId} is not null and ${table.name} ~ '[^[:space:]]' and ${table.categoryId} is not null and ${table.addedOn} is not null)`),
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

export const inspirationAnalysisStatuses = ["manual", "queued", "running", "ready", "failed"] as const;
export const inspirationAnalysisSources = ["openai", "qwen"] as const;
export const styleProfileSources = ["rules", "openai", "qwen"] as const;
export const styleRuleTypes = ["color", "style", "fit", "material", "formality", "text"] as const;
export const recreationModes = ["rules", "openai", "qwen"] as const;
export const processingJobStatuses = ["queued", "running", "succeeded", "failed"] as const;
export const processingJobTypes = ["inspiration-analysis"] as const;
export const inspirationFields = [
  "name",
  "styleTags",
  "colorNames",
  "silhouettes",
  "keyItems",
  "combinations",
  "formality",
] as const;

export const inspirations = pgTable("inspirations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadId: uuid("upload_id").notNull(),
  name: text("name").notNull().default(""),
  styleTags: jsonb("style_tags").$type<string[]>().notNull().default([]),
  colorNames: jsonb("color_names").$type<string[]>().notNull().default([]),
  silhouettes: jsonb("silhouettes").$type<string[]>().notNull().default([]),
  keyItems: jsonb("key_items").$type<string[]>().notNull().default([]),
  combinations: jsonb("combinations").$type<string[]>().notNull().default([]),
  formality: text("formality"),
  notes: text("notes"),
  confirmedFields: jsonb("confirmed_fields").$type<(typeof inspirationFields)[number][]>().notNull().default([]),
  analysisStatus: text("analysis_status").$type<(typeof inspirationAnalysisStatuses)[number]>().notNull().default("manual"),
  analysisSource: text("analysis_source").$type<(typeof inspirationAnalysisSources)[number]>(),
  analysisErrorCode: text("analysis_error_code"),
  analysisAttempts: integer("analysis_attempts").notNull().default(0),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inspirations_user_id_id_unique").on(table.userId, table.id),
  uniqueIndex("inspirations_upload_id_unique").on(table.uploadId),
  index("inspirations_user_deleted_created_index").on(table.userId, table.deletedAt, table.createdAt),
  foreignKey({
    name: "inspirations_tenant_upload_fk",
    columns: [table.userId, table.uploadId],
    foreignColumns: [uploads.userId, uploads.id],
  }),
  check("inspirations_style_tags_check", sql`jsonb_typeof(${table.styleTags}) = 'array'`),
  check("inspirations_color_names_check", sql`jsonb_typeof(${table.colorNames}) = 'array'`),
  check("inspirations_silhouettes_check", sql`jsonb_typeof(${table.silhouettes}) = 'array'`),
  check("inspirations_key_items_check", sql`jsonb_typeof(${table.keyItems}) = 'array'`),
  check("inspirations_combinations_check", sql`jsonb_typeof(${table.combinations}) = 'array'`),
  check("inspirations_confirmed_fields_check", jsonArrayValues(table.confirmedFields, inspirationFields)),
  check("inspirations_analysis_status_check", enumValues(table.analysisStatus, inspirationAnalysisStatuses)),
  check("inspirations_analysis_source_check", enumValues(table.analysisSource, inspirationAnalysisSources)),
  check("inspirations_analysis_attempts_check", sql`${table.analysisAttempts} between 0 and 2`),
  check("inspirations_version_check", sql`${table.version} >= 1`),
]);

export const styleProfiles = pgTable("style_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  preferredColors: jsonb("preferred_colors").$type<string[]>().notNull().default([]),
  preferredSilhouettes: jsonb("preferred_silhouettes").$type<string[]>().notNull().default([]),
  commonCombinations: jsonb("common_combinations").$type<string[]>().notNull().default([]),
  formalityTendency: text("formality_tendency"),
  likedExamples: jsonb("liked_examples").$type<string[]>().notNull().default([]),
  source: text("source").$type<(typeof styleProfileSources)[number]>().notNull().default("rules"),
  inputVersion: text("input_version").notNull(),
  manuallyEdited: boolean("manually_edited").notNull().default(false),
  pendingSuggestion: jsonb("pending_suggestion").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("style_profiles_preferred_colors_check", sql`jsonb_typeof(${table.preferredColors}) = 'array'`),
  check("style_profiles_preferred_silhouettes_check", sql`jsonb_typeof(${table.preferredSilhouettes}) = 'array'`),
  check("style_profiles_common_combinations_check", sql`jsonb_typeof(${table.commonCombinations}) = 'array'`),
  check("style_profiles_liked_examples_check", sql`jsonb_typeof(${table.likedExamples}) = 'array'`),
  check("style_profiles_pending_suggestion_check", sql`${table.pendingSuggestion} is null or jsonb_typeof(${table.pendingSuggestion}) = 'object'`),
  check("style_profiles_source_check", enumValues(table.source, styleProfileSources)),
]);

export const styleRules = pgTable("style_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof styleRuleTypes)[number]>().notNull(),
  value: text("value").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("style_rules_user_id_id_unique").on(table.userId, table.id),
  index("style_rules_user_id_index").on(table.userId),
  check("style_rules_type_check", enumValues(table.type, styleRuleTypes)),
  check("style_rules_value_check", sql`${table.value} ~ '[^[:space:]]'`),
]);

export const inspirationRecreations = pgTable("inspiration_recreations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inspirationId: uuid("inspiration_id").notNull(),
  mode: text("mode").$type<(typeof recreationModes)[number]>().notNull().default("rules"),
  similarities: jsonb("similarities").$type<string[]>().notNull().default([]),
  missing: jsonb("missing").$type<string[]>().notNull().default([]),
  inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inspiration_recreations_user_id_id_unique").on(table.userId, table.id),
  index("inspiration_recreations_user_inspiration_index").on(table.userId, table.inspirationId),
  foreignKey({
    name: "inspiration_recreations_tenant_inspiration_fk",
    columns: [table.userId, table.inspirationId],
    foreignColumns: [inspirations.userId, inspirations.id],
  }).onDelete("cascade"),
  check("inspiration_recreations_mode_check", enumValues(table.mode, recreationModes)),
  check("inspiration_recreations_similarities_check", sql`jsonb_typeof(${table.similarities}) = 'array'`),
  check("inspiration_recreations_missing_check", sql`jsonb_typeof(${table.missing}) = 'array'`),
  check("inspiration_recreations_snapshot_check", sql`jsonb_typeof(${table.inputSnapshot}) = 'object'`),
]);

export const inspirationRecreationItems = pgTable("inspiration_recreation_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recreationId: uuid("recreation_id").notNull(),
  itemId: uuid("item_id").notNull(),
  slot: text("slot").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    name: "inspiration_recreation_items_tenant_recreation_fk",
    columns: [table.userId, table.recreationId],
    foreignColumns: [inspirationRecreations.userId, inspirationRecreations.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "inspiration_recreation_items_tenant_item_fk",
    columns: [table.userId, table.itemId],
    foreignColumns: [items.userId, items.id],
  }),
  uniqueIndex("inspiration_recreation_items_recreation_item_unique").on(table.recreationId, table.itemId),
  uniqueIndex("inspiration_recreation_items_recreation_sort_unique").on(table.recreationId, table.sortOrder),
  check("inspiration_recreation_items_slot_check", sql`${table.slot} ~ '[^[:space:]]'`),
  check("inspiration_recreation_items_sort_order_check", sql`${table.sortOrder} >= 0`),
]);

export const processingJobs = pgTable("processing_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof processingJobTypes)[number]>().notNull(),
  targetInspirationId: uuid("target_inspiration_id").notNull(),
  inputVersion: integer("input_version").notNull(),
  status: text("status").$type<(typeof processingJobStatuses)[number]>().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("processing_jobs_runnable_index").on(table.status, table.nextAttemptAt, table.leaseExpiresAt),
  index("processing_jobs_user_target_index").on(table.userId, table.targetInspirationId),
  foreignKey({
    name: "processing_jobs_tenant_inspiration_fk",
    columns: [table.userId, table.targetInspirationId],
    foreignColumns: [inspirations.userId, inspirations.id],
  }).onDelete("cascade"),
  check("processing_jobs_type_check", enumValues(table.type, processingJobTypes)),
  check("processing_jobs_status_check", enumValues(table.status, processingJobStatuses)),
  check("processing_jobs_input_version_check", sql`${table.inputVersion} >= 1`),
  check("processing_jobs_attempts_check", sql`${table.attempts} between 0 and 2`),
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
  inspirations,
  styleProfiles,
  styleRules,
  inspirationRecreations,
  inspirationRecreationItems,
  processingJobs,
};
