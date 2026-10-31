CREATE TYPE "public"."block_kind" AS ENUM('strength', 'abs', 'core', 'finisher', 'conditioning', 'circuit', 'hiit', 'swim', 'recovery', 'other');--> statement-breakpoint
CREATE TYPE "public"."block_selection" AS ENUM('all', 'pickOne', 'pickAny');--> statement-breakpoint
CREATE TYPE "public"."day_kind" AS ENUM('strength', 'recovery', 'rest', 'choice');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('previewed', 'imported', 'failed');--> statement-breakpoint
CREATE TYPE "public"."planned_session_status" AS ENUM('planned', 'moved', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('reps', 'maxReps', 'duration');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('kg', 'lb');--> statement-breakpoint
CREATE TYPE "public"."workout_session_status" AS ENUM('in_progress', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "owner_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_account_email_unique" UNIQUE("email"),
	CONSTRAINT "owner_account_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "owner_account_singleton_true" CHECK ("owner_account"."singleton" = true)
);
--> statement-breakpoint
CREATE TABLE "personal_settings" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"unit" "weight_unit" DEFAULT 'kg' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_time" time,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"file_size" integer NOT NULL,
	"status" "import_status" DEFAULT 'previewed' NOT NULL,
	"sheet_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone,
	CONSTRAINT "import_batches_file_sha256_unique" UNIQUE("file_sha256")
);
--> statement-breakpoint
CREATE TABLE "planned_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"raw_name" text NOT NULL,
	"note" text,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sets" smallint,
	"target_type" "target_type",
	"reps_min" smallint,
	"reps_max" smallint,
	"duration_s" integer,
	"to_failure" boolean DEFAULT false NOT NULL,
	"per_side" boolean DEFAULT false NOT NULL,
	"applies_to_each" boolean DEFAULT false NOT NULL,
	"rest_s" integer,
	"source_text" text DEFAULT '' NOT NULL,
	"rest_source_text" text DEFAULT '' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	CONSTRAINT "planned_exercises_block_position" UNIQUE("block_id","position"),
	CONSTRAINT "planned_exercises_sets_range" CHECK ("planned_exercises"."sets" is null or "planned_exercises"."sets" between 1 and 20),
	CONSTRAINT "planned_exercises_reps_order" CHECK ("planned_exercises"."reps_min" is null or "planned_exercises"."reps_max" is null or "planned_exercises"."reps_min" <= "planned_exercises"."reps_max")
);
--> statement-breakpoint
CREATE TABLE "training_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid,
	"version" integer NOT NULL,
	"title" text,
	"summary" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"reference" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_programs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "workout_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"kind" "block_kind" NOT NULL,
	"name" text NOT NULL,
	"raw_title" text NOT NULL,
	"duration_text" text,
	"duration_minutes" smallint,
	"rounds" smallint,
	"rest_between_rounds_s" integer,
	"optional" boolean DEFAULT false NOT NULL,
	"selection" "block_selection" DEFAULT 'all' NOT NULL,
	"instructions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "workout_blocks_variant_position" UNIQUE("variant_id","position")
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"kind" "day_kind" NOT NULL,
	"title" text,
	"focus" text,
	"duration_text" text,
	"steps_target" integer,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "workout_templates_program_weekday" UNIQUE("program_id","weekday"),
	CONSTRAINT "workout_templates_weekday_range" CHECK ("workout_templates"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "workout_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "workout_variants_template_number" UNIQUE("template_id","number")
);
--> statement-breakpoint
CREATE TABLE "planned_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"template_id" uuid NOT NULL,
	"variant_id" uuid,
	"status" "planned_session_status" DEFAULT 'planned' NOT NULL,
	"moved_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"snapshot_key" text NOT NULL,
	"set_number" smallint NOT NULL,
	"weight_kg" numeric(6, 2),
	"reps" smallint,
	"duration_s" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_logs_session_exercise_set" UNIQUE("session_id","snapshot_key","set_number"),
	CONSTRAINT "set_logs_set_number_positive" CHECK ("set_logs"."set_number" >= 1),
	CONSTRAINT "set_logs_weight_positive" CHECK ("set_logs"."weight_kg" is null or "set_logs"."weight_kg" >= 0),
	CONSTRAINT "set_logs_reps_positive" CHECK ("set_logs"."reps" is null or "set_logs"."reps" >= 0),
	CONSTRAINT "set_logs_duration_positive" CHECK ("set_logs"."duration_s" is null or "set_logs"."duration_s" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planned_session_id" uuid,
	"status" "workout_session_status" DEFAULT 'in_progress' NOT NULL,
	"is_active" boolean GENERATED ALWAYS AS (status in ('in_progress', 'paused')) STORED NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_total_s" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone,
	"plan_snapshot" jsonb NOT NULL,
	"notes" text,
	"steps" integer,
	"idempotency_key" uuid NOT NULL,
	CONSTRAINT "workout_sessions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "workout_sessions_end_after_start" CHECK ("workout_sessions"."ended_at" is null or "workout_sessions"."ended_at" >= "workout_sessions"."started_at"),
	CONSTRAINT "workout_sessions_steps_positive" CHECK ("workout_sessions"."steps" is null or "workout_sessions"."steps" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_owner_id_owner_account_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_settings" ADD CONSTRAINT "personal_settings_owner_id_owner_account_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_exercises" ADD CONSTRAINT "planned_exercises_block_id_workout_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."workout_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_exercises" ADD CONSTRAINT "planned_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_variant_id_workout_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."workout_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_variants" ADD CONSTRAINT "workout_variants_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_variant_id_workout_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."workout_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_planned_session_id_planned_sessions_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_name_ci" ON "exercises" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "planned_exercises_exercise_idx" ON "planned_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_programs_one_active" ON "training_programs" USING btree ("is_active") WHERE "training_programs"."is_active";--> statement-breakpoint
CREATE INDEX "planned_sessions_date_idx" ON "planned_sessions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "set_logs_exercise_idx" ON "set_logs" USING btree ("exercise_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_active" ON "workout_sessions" USING btree ("is_active") WHERE "workout_sessions"."is_active";--> statement-breakpoint
CREATE INDEX "workout_sessions_started_at_idx" ON "workout_sessions" USING btree ("started_at");