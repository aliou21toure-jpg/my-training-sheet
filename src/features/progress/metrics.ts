/** Pure progress types and helpers, safe to import in client components. */

export type Metric = "weight" | "reps" | "duration";

export interface ExercisePoint {
  date: string;
  sessionId: string;
  /** Heaviest validated set (kg) — null if no set had a weight. */
  maxWeightKg: number | null;
  /** Reps done on that heaviest set. */
  repsAtMax: number | null;
  /** Most reps in one set (used for bodyweight exercises). */
  maxReps: number | null;
  maxDurationSeconds: number | null;
  /** Σ weight × reps of sets that have both; null when none has both. */
  volumeKg: number | null;
  sets: number;
}

export interface WeekBar {
  weekStart: string;
  label: string;
  completed: number;
  planned: number;
  volumeKg: number | null;
}

export function valueOf(p: ExercisePoint, metric: Metric): number | null {
  return metric === "weight" ? p.maxWeightKg : metric === "duration" ? p.maxDurationSeconds : p.maxReps;
}

/** Unit label of a metric: "kg"/"lb" for weights, "s" for durations, "reps" otherwise. */
export function metricUnit(metric: Metric, unit: "kg" | "lb"): string {
  return metric === "weight" ? unit : metric === "duration" ? "s" : "reps";
}
