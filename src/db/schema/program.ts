/**
 * The training plan, versioned. Each import (or edit) creates a new
 * training_programs row; exactly one is active. Past workouts never point
 * at these rows for their content — they keep their own snapshot.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { blockKind, blockSelection, dayKind, importStatus, targetType } from "./enums";

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  /** Same bytes = same hash: importing the identical file twice is refused. */
  fileSha256: text("file_sha256").notNull().unique(),
  fileSize: integer("file_size").notNull(),
  status: importStatus("status").notNull().default("previewed"),
  sheetNames: jsonb("sheet_names").$type<string[]>().notNull().default([]),
  /** Issues found by the parser (review / info), kept for the record. */
  report: jsonb("report").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  importedAt: timestamp("imported_at", { withTimezone: true }),
});

export const trainingPrograms = pgTable(
  "training_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    version: integer("version").notNull().unique(),
    title: text("title"),
    summary: text("summary"),
    isActive: boolean("is_active").notNull().default(false),
    /** Warm-up / cool-down parts, rules and notes: reference only, never targets. */
    reference: jsonb("reference").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one active program.
    uniqueIndex("training_programs_one_active").on(t.isActive).where(sql`${t.isActive}`),
  ],
);

export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "cascade" }),
    /** ISO weekday, 1 = Monday … 7 = Sunday. */
    weekday: smallint("weekday").notNull(),
    kind: dayKind("kind").notNull(),
    title: text("title"),
    focus: text("focus"),
    /** As written in the overview ("60 min", "30-40 min"). */
    durationText: text("duration_text"),
    stepsTarget: integer("steps_target"),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
  },
  (t) => [
    unique("workout_templates_program_weekday").on(t.programId, t.weekday),
    check("workout_templates_weekday_range", sql`${t.weekday} between 1 and 7`),
  ],
);

export const workoutVariants = pgTable(
  "workout_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    number: smallint("number").notNull(),
    label: text("label").notNull(),
  },
  (t) => [unique("workout_variants_template_number").on(t.templateId, t.number)],
);

export const workoutBlocks = pgTable(
  "workout_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => workoutVariants.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    kind: blockKind("kind").notNull(),
    name: text("name").notNull(),
    rawTitle: text("raw_title").notNull(),
    durationText: text("duration_text"),
    durationMinutes: smallint("duration_minutes"),
    rounds: smallint("rounds"),
    restBetweenRoundsSeconds: integer("rest_between_rounds_s"),
    optional: boolean("optional").notNull().default(false),
    selection: blockSelection("selection").notNull().default("all"),
    instructions: jsonb("instructions").$type<string[]>().notNull().default([]),
  },
  (t) => [unique("workout_blocks_variant_position").on(t.variantId, t.position)],
);

/** Shared catalogue: the same "Plank" across days and across program versions. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("exercises_name_ci").on(sql`lower(${t.name})`)],
);

export const plannedExercises = pgTable(
  "planned_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => workoutBlocks.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
    /** Cell text as written, e.g. "Hack Squat (Le premier…)". */
    rawName: text("raw_name").notNull(),
    note: text("note"),
    alternatives: jsonb("alternatives").$type<string[]>().notNull().default([]),
    components: jsonb("components").$type<string[]>().notNull().default([]),
    sets: smallint("sets"),
    targetType: targetType("target_type"),
    repsMin: smallint("reps_min"),
    repsMax: smallint("reps_max"),
    durationSeconds: integer("duration_s"),
    toFailure: boolean("to_failure").notNull().default(false),
    perSide: boolean("per_side").notNull().default(false),
    appliesToEachExercise: boolean("applies_to_each").notNull().default(false),
    restSeconds: integer("rest_s"),
    /** Original "Sets x Reps" and "Rest" cells, always kept. */
    sourceText: text("source_text").notNull().default(""),
    restSourceText: text("rest_source_text").notNull().default(""),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
  },
  (t) => [
    unique("planned_exercises_block_position").on(t.blockId, t.position),
    check("planned_exercises_sets_range", sql`${t.sets} is null or ${t.sets} between 1 and 20`),
    check(
      "planned_exercises_reps_order",
      sql`${t.repsMin} is null or ${t.repsMax} is null or ${t.repsMin} <= ${t.repsMax}`,
    ),
    index("planned_exercises_exercise_idx").on(t.exerciseId),
  ],
);
