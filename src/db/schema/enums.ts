import { pgEnum } from "drizzle-orm/pg-core";

// Values match the TypeScript types of features/import/types.ts.
export const dayKind = pgEnum("day_kind", ["strength", "recovery", "rest", "choice"]);
export const blockKind = pgEnum("block_kind", [
  "strength",
  "abs",
  "core",
  "finisher",
  "conditioning",
  "circuit",
  "hiit",
  "swim",
  "recovery",
  "other",
]);
export const blockSelection = pgEnum("block_selection", ["all", "pickOne", "pickAny"]);
export const targetType = pgEnum("target_type", ["reps", "maxReps", "duration"]);

export const importStatus = pgEnum("import_status", ["previewed", "imported", "failed"]);
export const plannedSessionStatus = pgEnum("planned_session_status", ["planned", "moved", "skipped"]);
export const workoutSessionStatus = pgEnum("workout_session_status", [
  "in_progress",
  "paused",
  "completed",
  "abandoned",
]);

export const theme = pgEnum("theme", ["system", "light", "dark"]);
export const weightUnit = pgEnum("weight_unit", ["kg", "lb"]);
