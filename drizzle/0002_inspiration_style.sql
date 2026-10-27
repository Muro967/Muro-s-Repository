CREATE TABLE "inspiration_recreation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recreation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspiration_recreation_items_slot_check" CHECK ("inspiration_recreation_items"."slot" ~ '[^[:space:]]'),
	CONSTRAINT "inspiration_recreation_items_sort_order_check" CHECK ("inspiration_recreation_items"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inspiration_recreations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"inspiration_id" uuid NOT NULL,
	"mode" text DEFAULT 'rules' NOT NULL,
	"similarities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspiration_recreations_mode_check" CHECK ("inspiration_recreations"."mode" in ('rules', 'openai', 'qwen')),
	CONSTRAINT "inspiration_recreations_similarities_check" CHECK (jsonb_typeof("inspiration_recreations"."similarities") = 'array'),
	CONSTRAINT "inspiration_recreations_missing_check" CHECK (jsonb_typeof("inspiration_recreations"."missing") = 'array'),
	CONSTRAINT "inspiration_recreations_snapshot_check" CHECK (jsonb_typeof("inspiration_recreations"."input_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "inspirations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"style_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"color_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"silhouettes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"combinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"formality" text,
	"notes" text,
	"confirmed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analysis_status" text DEFAULT 'manual' NOT NULL,
	"analysis_source" text,
	"analysis_error_code" text,
	"analysis_attempts" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspirations_style_tags_check" CHECK (jsonb_typeof("inspirations"."style_tags") = 'array'),
	CONSTRAINT "inspirations_color_names_check" CHECK (jsonb_typeof("inspirations"."color_names") = 'array'),
	CONSTRAINT "inspirations_silhouettes_check" CHECK (jsonb_typeof("inspirations"."silhouettes") = 'array'),
	CONSTRAINT "inspirations_key_items_check" CHECK (jsonb_typeof("inspirations"."key_items") = 'array'),
	CONSTRAINT "inspirations_combinations_check" CHECK (jsonb_typeof("inspirations"."combinations") = 'array'),
	CONSTRAINT "inspirations_confirmed_fields_check" CHECK (jsonb_typeof("inspirations"."confirmed_fields") = 'array' and "inspirations"."confirmed_fields" <@ '["name","styleTags","colorNames","silhouettes","keyItems","combinations","formality"]'::jsonb),
	CONSTRAINT "inspirations_analysis_status_check" CHECK ("inspirations"."analysis_status" in ('manual', 'queued', 'running', 'ready', 'failed')),
	CONSTRAINT "inspirations_analysis_source_check" CHECK ("inspirations"."analysis_source" in ('openai', 'qwen')),
	CONSTRAINT "inspirations_analysis_attempts_check" CHECK ("inspirations"."analysis_attempts" between 0 and 2),
	CONSTRAINT "inspirations_version_check" CHECK ("inspirations"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"target_inspiration_id" uuid NOT NULL,
	"input_version" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_jobs_type_check" CHECK ("processing_jobs"."type" in ('inspiration-analysis')),
	CONSTRAINT "processing_jobs_status_check" CHECK ("processing_jobs"."status" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "processing_jobs_input_version_check" CHECK ("processing_jobs"."input_version" >= 1),
	CONSTRAINT "processing_jobs_attempts_check" CHECK ("processing_jobs"."attempts" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "style_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"preferred_colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_silhouettes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_combinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"formality_tendency" text,
	"liked_examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'rules' NOT NULL,
	"input_version" text NOT NULL,
	"manually_edited" boolean DEFAULT false NOT NULL,
	"pending_suggestion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "style_profiles_preferred_colors_check" CHECK (jsonb_typeof("style_profiles"."preferred_colors") = 'array'),
	CONSTRAINT "style_profiles_preferred_silhouettes_check" CHECK (jsonb_typeof("style_profiles"."preferred_silhouettes") = 'array'),
	CONSTRAINT "style_profiles_common_combinations_check" CHECK (jsonb_typeof("style_profiles"."common_combinations") = 'array'),
	CONSTRAINT "style_profiles_liked_examples_check" CHECK (jsonb_typeof("style_profiles"."liked_examples") = 'array'),
	CONSTRAINT "style_profiles_pending_suggestion_check" CHECK ("style_profiles"."pending_suggestion" is null or jsonb_typeof("style_profiles"."pending_suggestion") = 'object'),
	CONSTRAINT "style_profiles_source_check" CHECK ("style_profiles"."source" in ('rules', 'openai', 'qwen'))
);
--> statement-breakpoint
CREATE TABLE "style_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "style_rules_type_check" CHECK ("style_rules"."type" in ('color', 'style', 'fit', 'material', 'formality', 'text')),
	CONSTRAINT "style_rules_value_check" CHECK ("style_rules"."value" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inspiration_recreations_user_id_id_unique" ON "inspiration_recreations" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspirations_user_id_id_unique" ON "inspirations" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "inspiration_recreation_items" ADD CONSTRAINT "inspiration_recreation_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspiration_recreation_items" ADD CONSTRAINT "inspiration_recreation_items_tenant_recreation_fk" FOREIGN KEY ("user_id","recreation_id") REFERENCES "public"."inspiration_recreations"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspiration_recreation_items" ADD CONSTRAINT "inspiration_recreation_items_tenant_item_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."items"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspiration_recreations" ADD CONSTRAINT "inspiration_recreations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspiration_recreations" ADD CONSTRAINT "inspiration_recreations_tenant_inspiration_fk" FOREIGN KEY ("user_id","inspiration_id") REFERENCES "public"."inspirations"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspirations" ADD CONSTRAINT "inspirations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspirations" ADD CONSTRAINT "inspirations_tenant_upload_fk" FOREIGN KEY ("user_id","upload_id") REFERENCES "public"."uploads"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_tenant_inspiration_fk" FOREIGN KEY ("user_id","target_inspiration_id") REFERENCES "public"."inspirations"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_rules" ADD CONSTRAINT "style_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inspiration_recreation_items_recreation_item_unique" ON "inspiration_recreation_items" USING btree ("recreation_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspiration_recreation_items_recreation_sort_unique" ON "inspiration_recreation_items" USING btree ("recreation_id","sort_order");--> statement-breakpoint
CREATE INDEX "inspiration_recreations_user_inspiration_index" ON "inspiration_recreations" USING btree ("user_id","inspiration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspirations_upload_id_unique" ON "inspirations" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "inspirations_user_deleted_created_index" ON "inspirations" USING btree ("user_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_runnable_index" ON "processing_jobs" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_user_target_index" ON "processing_jobs" USING btree ("user_id","target_inspiration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "style_rules_user_id_id_unique" ON "style_rules" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "style_rules_user_id_index" ON "style_rules" USING btree ("user_id");
