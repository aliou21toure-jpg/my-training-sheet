/**
 * Numbers shown at the end of a workout. Pure functions.
 *
 * Rule: a value that was not entered is MISSING, never zero. A set without
 * a weight adds nothing to the volume; it is not counted as "0 kg".
 */
import type { WorkoutSnapshot } from "./snapshot";

export interface LoggedSet {
  snapshotKey: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  completed: boolean;
}

export interface SessionSummary {
  activeSeconds: number;
  completedSets: number;
  exercisesDone: number;
  plannedExercises: number;
  /** Σ weight × reps over completed sets that have both values. Null when no set has both. */
  volumeKg: number | null;
  /** Completed sets without a weight (bodyweight or not entered): shown, not counted in volume. */
  setsWithoutWeight: number;
}

export function summarizeSession(snapshot: WorkoutSnapshot, logs: LoggedSet[], activeSeconds: number): SessionSummary {
  const done = logs.filter((l) => l.completed);
  const withLoad = done.filter((l) => l.weightKg !== null && l.reps !== null);
  return {
    activeSeconds: Math.max(0, Math.round(activeSeconds)),
    completedSets: done.length,
    exercisesDone: new Set(done.map((l) => l.snapshotKey)).size,
    plannedExercises: snapshot.blocks.filter((b) => !b.optional).reduce((n, b) => n + b.exercises.length, 0),
    volumeKg: withLoad.length ? Math.round(withLoad.reduce((v, l) => v + l.weightKg! * l.reps!, 0) * 10) / 10 : null,
    setsWithoutWeight: done.filter((l) => l.weightKg === null).length,
  };
}

export interface PersonalBest {
  maxWeightKg: number | null;
  maxReps: number | null;
  maxDurationSeconds: number | null;
}

export interface NewRecord {
  exerciseId: string;
  name: string;
  kind: "weight" | "reps" | "duration";
  value: number;
  previous: number;
}

/**
 * A record is beating a value that EXISTS in past sessions.
 * A first-ever attempt is not a record (there is nothing to beat).
 */
export function findNewRecords(
  snapshot: WorkoutSnapshot,
  logs: LoggedSet[],
  previousBests: Map<string, PersonalBest>,
): NewRecord[] {
  const names = new Map(snapshot.blocks.flatMap((b) => b.exercises.map((e) => [e.exerciseId, e.name] as const)));
  const records: NewRecord[] = [];
  const byExercise = new Map<string, LoggedSet[]>();
  for (const l of logs) {
    if (!l.completed) continue;
    byExercise.set(l.exerciseId, [...(byExercise.get(l.exerciseId) ?? []), l]);
  }

  for (const [exerciseId, sets] of byExercise) {
    const before = previousBests.get(exerciseId);
    if (!before) continue;
    const name = names.get(exerciseId) ?? "Exercice";
    const max = (values: (number | null)[]) => {
      const present = values.filter((v): v is number => v !== null);
      return present.length ? Math.max(...present) : null;
    };

    const weight = max(sets.map((s) => s.weightKg));
    if (weight !== null && before.maxWeightKg !== null && weight > before.maxWeightKg) {
      records.push({ exerciseId, name, kind: "weight", value: weight, previous: before.maxWeightKg });
      continue; // one record per exercise is enough on the summary
    }
    const reps = max(sets.filter((s) => s.weightKg === null).map((s) => s.reps));
    if (reps !== null && before.maxReps !== null && reps > before.maxReps) {
      records.push({ exerciseId, name, kind: "reps", value: reps, previous: before.maxReps });
      continue;
    }
    const duration = max(sets.map((s) => s.durationSeconds));
    if (duration !== null && before.maxDurationSeconds !== null && duration > before.maxDurationSeconds) {
      records.push({ exerciseId, name, kind: "duration", value: duration, previous: before.maxDurationSeconds });
    }
  }
  return records;
}
