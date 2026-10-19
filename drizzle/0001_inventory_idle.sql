CREATE TABLE "disposal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"method" text NOT NULL,
	"disposed_on" date NOT NULL,
	"sale_amount_minor" integer,
	"currency" text,
	"platform" text,
	"recipient" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disposal_records_method_check" CHECK ("disposal_records"."method" in ('sold', 'gifted', 'donated', 'recycled', 'upcycled', 'discarded')),
	CONSTRAINT "disposal_records_amount_check" CHECK ("disposal_records"."sale_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_assets_role_check" CHECK ("item_assets"."role" = 'original')
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_id" uuid,
	"zone_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"category_id" text,
	"accessory_id" text,
	"color_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"color_hexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"season_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thickness" text,
	"material" text,
	"fit" text,
	"length" text,
	"formality" text,
	"brand" text,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"added_on" date,
	"manual_last_worn_on" date,
	"watch_started_on" date,
	"watch_due_on" date,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_status_check" CHECK ("items"."status" in ('draft', 'active', 'watching', 'disposed')),
	CONSTRAINT "items_category_check" CHECK ("items"."category_id" in ('tops', 'bottoms', 'outerwear', 'dresses', 'shoes', 'bags', 'accessories')),
	CONSTRAINT "items_accessory_check" CHECK ("items"."accessory_id" in ('necklaces', 'earrings', 'hair-accessories', 'hats', 'scarves', 'watches', 'rings', 'bracelets', 'brooches', 'belts', 'eyewear')),
	CONSTRAINT "items_color_names_check" CHECK (jsonb_typeof("items"."color_names") = 'array'),
	CONSTRAINT "items_color_hexes_check" CHECK (jsonb_typeof("items"."color_hexes") = 'array'),
	CONSTRAINT "items_style_ids_check" CHECK (jsonb_typeof("items"."style_ids") = 'array' and "items"."style_ids" <@ '["french","quiet-luxury","british","preppy","vintage","gentleman","minimalist","japanese-minimal","mori","korean","nordic","clean-fit","american-casual","amekaji","city-boy","streetwear","skate","y2k","workwear","athleisure","techwear","outdoor","tennis","yoga-pilates","sweet","balletcore","cottagecore","bohemian","gentle-intellectual","dopamine","dark","punk","rock","hip-hop","deconstruction","neo-chinese","japanese-traditional","ethnic","business-formal","business-casual","commuter","resort","party","home"]'::jsonb),
	CONSTRAINT "items_season_ids_check" CHECK (jsonb_typeof("items"."season_ids") = 'array' and "items"."season_ids" <@ '["spring","summer","autumn","winter"]'::jsonb),
	CONSTRAINT "items_zone_requires_wardrobe_check" CHECK ("items"."zone_id" is null or "items"."wardrobe_id" is not null),
	CONSTRAINT "items_complete_metadata_check" CHECK ("items"."status" = 'draft' or ("items"."wardrobe_id" is not null and "items"."zone_id" is not null and length(trim("items"."name")) > 0 and "items"."category_id" is not null and "items"."added_on" is not null)),
	CONSTRAINT "items_watch_dates_check" CHECK (("items"."status" = 'watching' and "items"."watch_started_on" is not null and "items"."watch_due_on" is not null and "items"."watch_due_on" >= "items"."watch_started_on") or ("items"."status" <> 'watching' and "items"."watch_started_on" is null and "items"."watch_due_on" is null))
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zones_kind_check" CHECK ("zones"."kind" in ('hang', 'shelf', 'drawer', 'shoe')),
	CONSTRAINT "zones_sort_order_check" CHECK ("zones"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "kind" text;--> statement-breakpoint
UPDATE "uploads"
SET "kind" = split_part("object_key", '/', 3)
WHERE "object_key" ~ '^users/[a-zA-Z0-9_-]{1,128}/(wardrobe-original|inspiration|wear-photo)/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  AND split_part("object_key", '/', 2) = "user_id"::text;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "uploads" WHERE "kind" IS NULL) THEN
    RAISE EXCEPTION 'Cannot classify legacy upload object key; migration aborted';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "idle_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "watch_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "season_override" text;--> statement-breakpoint
ALTER TABLE "wardrobes" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "wardrobes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- PostgreSQL requires referenced composite unique keys before adding foreign keys.
CREATE UNIQUE INDEX "items_user_id_id_unique" ON "items" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "zones_user_id_id_unique" ON "zones" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "zones_user_wardrobe_id_unique" ON "zones" USING btree ("user_id","wardrobe_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_user_id_id_unique" ON "uploads" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "wardrobes_user_id_id_unique" ON "wardrobes" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "disposal_records" ADD CONSTRAINT "disposal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposal_records" ADD CONSTRAINT "disposal_records_tenant_item_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assets" ADD CONSTRAINT "item_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assets" ADD CONSTRAINT "item_assets_tenant_item_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assets" ADD CONSTRAINT "item_assets_tenant_upload_fk" FOREIGN KEY ("user_id","upload_id") REFERENCES "public"."uploads"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_wardrobe_fk" FOREIGN KEY ("user_id","wardrobe_id") REFERENCES "public"."wardrobes"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_zone_fk" FOREIGN KEY ("user_id","wardrobe_id","zone_id") REFERENCES "public"."zones"("user_id","wardrobe_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_tenant_wardrobe_fk" FOREIGN KEY ("user_id","wardrobe_id") REFERENCES "public"."wardrobes"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disposal_records_item_unique" ON "disposal_records" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_assets_item_role_unique" ON "item_assets" USING btree ("item_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "item_assets_upload_unique" ON "item_assets" USING btree ("upload_id");--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_kind_check" CHECK ("uploads"."kind" in ('wardrobe-original', 'inspiration', 'wear-photo'));--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_idle_days_check" CHECK ("user_settings"."idle_days" between 1 and 3650);--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_watch_days_check" CHECK ("user_settings"."watch_days" between 1 and 365);--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_season_override_check" CHECK ("user_settings"."season_override" in ('spring', 'summer', 'autumn', 'winter'));--> statement-breakpoint
INSERT INTO "zones" ("user_id", "wardrobe_id", "name", "kind", "sort_order")
SELECT "user_id", "id", '默认挂衣区', 'hang', 0 FROM "wardrobes";
