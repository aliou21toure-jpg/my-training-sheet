/**
 * The calendar and what actually happened.
 *
 * workout_sessions.plan_snapshot is a frozen copy of the planned workout at
 * the moment it was started: editing or replacing the program later never
 * changes history. set_logs point into that snapshot with snapshot_key.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { plannedSessionStatus, workoutSessionStatus } from "./enums";
import { exercises, workoutTemplates, workoutVariants } from "./program";

export const plannedSessions = pgTable(
  "planned_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Calendar day in the owner's time zone (no time, no UTC shift). */
    date: date("date").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "restrict" }),
    /** Saturday: the chosen option. Null until chosen, or for single-variant days. */
    variantId: uuid("variant_id").references(() => workoutVariants.id, { onDelete: "set null" }),
    status: plannedSessionStatus("status").notNull().default("planned"),
    movedFrom: date("moved_from"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One schedule exception per calendar day: the calendar upserts on it.
  (t) => [uniqueIndex("planned_sessions_date_unique").on(t.date)],
);

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plannedSessionId: uuid("planned_session_id").references(() => plannedSessions.id, { onDelete: "set null" }),
    status: workoutSessionStatus("status").notNull().default("in_progress"),
    /** true while in progress or paused — used to allow only one at a time. */
    isActive: boolean("is_active")
      .notNull()
      .generatedAlwaysAs(sql`status in ('in_progress', 'paused')`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedTotalSeconds: integer("paused_total_s").notNull().default(0),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    planSnapshot: jsonb("plan_snapshot").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    steps: integer("steps"),
    /** Sent by the client with "Start" / "Finish": a double tap is a no-op. */
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
  },
  (t) => [
    uniqueIndex("workout_sessions_one_active").on(t.isActive).where(sql`${t.isActive}`),
    index("workout_sessions_started_at_idx").on(t.startedAt),
    check("workout_sessions_end_after_start", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
    check("workout_sessions_steps_positive", sql`${t.steps} is null or ${t.steps} >= 0`),
  ],
);

export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    /** Which exercise of the snapshot this set belongs to, e.g. "v1.b2.e3". */
    snapshotKey: text("snapshot_key").notNull(),
    setNumber: smallint("set_number").notNull(),
    /** Always stored in kilograms; the kg/lb setting only changes the display. Null = not entered. */
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
    reps: smallint("reps"),
    durationSeconds: integer("duration_s"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Saving the same set twice updates it instead of duplicating it.
    unique("set_logs_session_exercise_set").on(t.sessionId, t.snapshotKey, t.setNumber),
    check("set_logs_set_number_positive", sql`${t.setNumber} >= 1`),
    check("set_logs_weight_positive", sql`${t.weightKg} is null or ${t.weightKg} >= 0`),
    check("set_logs_reps_positive", sql`${t.reps} is null or ${t.reps} >= 0`),
    check("set_logs_duration_positive", sql`${t.durationSeconds} is null or ${t.durationSeconds} >= 0`),
    index("set_logs_exercise_idx").on(t.exerciseId, t.completedAt),
  ],
);
