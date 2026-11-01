/**
 * Turning what is typed in the gym into numbers, and back. Pure functions.
 * "42,5" (French decimal comma) and "42.5" are both accepted.
 */
import { formatDisplayNumber, fromDisplayWeight, type WeightUnit } from "@/lib/units";
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

/** Typed values → stored values. Weights typed in lb are converted to kg. */
export function parseSetDraft(draft: SetDraft, exercise: Pick<SnapshotExercise, "input" | "durationUnit">, unit: WeightUnit = "kg"): ParsedSet {
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
  if (weight !== null && (!Number.isFinite(weight) || weight < 0 || fromDisplayWeight(weight, unit) > 999.75)) return { ok: false, field: "weight" };
  const reps = num(draft.reps);
  if (reps !== null && (!Number.isInteger(reps) || reps < 0 || reps > 999)) return { ok: false, field: "reps" };
  return { ok: true, weightKg: weight === null ? null : fromDisplayWeight(weight, unit), reps, durationSeconds: null };
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

export function draftFromLog(log: LoggedSet, exercise: Pick<SnapshotExercise, "durationUnit">, unit: WeightUnit = "kg"): SetDraft {
  return {
    setNumber: log.setNumber,
    weight: log.weightKg === null ? "" : formatDisplayNumber(log.weightKg, unit),
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
export function formatLogged(log: LoggedSet | undefined, exercise: Pick<SnapshotExercise, "durationUnit">, unit: WeightUnit = "kg"): string {
  if (!log) return "—";
  if (log.durationSeconds !== null) {
    return exercise.durationUnit === "min" ? `${formatNumber(Math.round((log.durationSeconds / 60) * 10) / 10)} min` : `${log.durationSeconds} s`;
  }
  if (log.weightKg !== null && log.reps !== null) return `${formatDisplayNumber(log.weightKg, unit)} × ${log.reps}`;
  if (log.reps !== null) return `× ${log.reps}`;
  if (log.weightKg !== null) return `${formatDisplayNumber(log.weightKg, unit)} ${unit}`;
  return "—";
}

/** "Dernière fois : 3 séries, 40 kg max" style one-liner. */
export function describePrevious(logs: LoggedSet[] | undefined, exercise: Pick<SnapshotExercise, "durationUnit">, unit: WeightUnit = "kg"): string | null {
  if (!logs || logs.length === 0) return null;
  return logs.map((l) => formatLogged(l, exercise, unit)).join(" · ");
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
