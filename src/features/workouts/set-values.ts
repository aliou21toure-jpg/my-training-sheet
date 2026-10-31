/**
 * Turning what is typed in the gym into numbers, and back. Pure functions.
 * "42,5" (French decimal comma) and "42.5" are both accepted.
 */
import type { SnapshotExercise } from "./snapshot";
import type { LoggedSet } from "./summary";

export interface SetDraft {
  setNumber: number;
  weight: string;
  reps: string;
  duration: string;
  completed: boolean;
}

export type ParsedSet =
  | { ok: true; weightKg: number | null; reps: number | null; durationSeconds: number | null }
  | { ok: false; field: "weight" | "reps" | "duration" };

const clean = (s: string) => s.trim().replace(",", ".");

export function parseSetDraft(draft: SetDraft, exercise: Pick<SnapshotExercise, "input" | "durationUnit">): ParsedSet {
  const num = (s: string) => (clean(s) === "" ? null : Number(clean(s)));

  if (exercise.input === "duration") {
    const value = num(draft.duration);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > (exercise.durationUnit === "min" ? 360 : 21_600))) {
      return { ok: false, field: "duration" };
    }
    const seconds = value === null ? null : Math.round(exercise.durationUnit === "min" ? value * 60 : value);
    return { ok: true, weightKg: null, reps: null, durationSeconds: seconds };
  }

  const weight = num(draft.weight);
  if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 999.75)) return { ok: false, field: "weight" };
  const reps = num(draft.reps);
  if (reps !== null && (!Number.isInteger(reps) || reps < 0 || reps > 999)) return { ok: false, field: "reps" };
  return { ok: true, weightKg: weight === null ? null : Math.round(weight * 100) / 100, reps, durationSeconds: null };
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

export function draftFromLog(log: LoggedSet, exercise: Pick<SnapshotExercise, "durationUnit">): SetDraft {
  return {
    setNumber: log.setNumber,
    weight: log.weightKg === null ? "" : formatNumber(log.weightKg),
    reps: log.reps === null ? "" : String(log.reps),
    duration:
      log.durationSeconds === null
        ? ""
        : exercise.durationUnit === "min"
          ? formatNumber(Math.round((log.durationSeconds / 60) * 10) / 10)
          : String(log.durationSeconds),
    completed: log.completed,
  };
}

/** "40 × 10", "45 s", "20 min", "× 12" (no weight) — for the "previous" column. */
export function formatLogged(log: LoggedSet | undefined, exercise: Pick<SnapshotExercise, "durationUnit">): string {
  if (!log) return "—";
  if (log.durationSeconds !== null) {
    return exercise.durationUnit === "min" ? `${formatNumber(Math.round((log.durationSeconds / 60) * 10) / 10)} min` : `${log.durationSeconds} s`;
  }
  if (log.weightKg !== null && log.reps !== null) return `${formatNumber(log.weightKg)} × ${log.reps}`;
  if (log.reps !== null) return `× ${log.reps}`;
  if (log.weightKg !== null) return `${formatNumber(log.weightKg)} kg`;
  return "—";
}

/** "Dernière fois : 3 séries, 40 kg max" style one-liner. */
export function describePrevious(logs: LoggedSet[] | undefined, exercise: Pick<SnapshotExercise, "durationUnit">): string | null {
  if (!logs || logs.length === 0) return null;
  return logs.map((l) => formatLogged(l, exercise)).join(" · ");
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
