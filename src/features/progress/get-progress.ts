/**
 * Everything the Progress screen shows. Only COMPLETED sessions and
 * VALIDATED sets count. A value that was never entered stays null:
 * it is a gap in a chart, never a zero.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { exercises, setLogs, trainingPrograms, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadActiveProgram } from "@/features/program/load-program";
import { resolveRange } from "@/features/schedule/schedule";
import { getTimeZone } from "@/features/settings/owner-settings";
import { addDays, localDateInfo, weekDates } from "@/lib/dates/local-date";
import { valueOf, type ExercisePoint, type Metric, type WeekBar } from "./metrics";

export type { ExercisePoint, Metric, WeekBar };
export { valueOf };

export type ProgressRange = "8w" | "6m" | "all";
export interface ExerciseSummary {
  id: string;
  name: string;
  metric: Metric;
  sessions: number;
  best: number | null;
  bestDate: string | null;
}

export interface Achievement {
  date: string;
  kind: "record" | "milestone";
  text: string;
  /** Records only: the value, so the screen can show it in kg or lb. */
  metric?: Metric;
  value?: number;
  previous?: number;
}

export interface ProgressData {
  range: ProgressRange;
  completedInRange: number;
  completedAllTime: number;
  plannedInRange: number;
  consistency: number | null;
  trainedWeeks: number;
  weeks: WeekBar[];
  exercises: ExerciseSummary[];
  selected: (ExerciseSummary & { points: ExercisePoint[] }) | null;
  achievements: Achievement[];
}

const RANGE_DAYS: Record<Exclude<ProgressRange, "all">, number> = { "8w": 56, "6m": 183 };
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** The main thing to follow for an exercise, from what was actually logged. */
function metricOf(points: ExercisePoint[]): Metric {
  if (points.some((p) => p.maxWeightKg !== null)) return "weight";
  if (points.some((p) => p.maxDurationSeconds !== null)) return "duration";
  return "reps";
}

const mondayOf = (iso: string) => addDays(iso, 1 - (((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1));


export async function getProgress(db: Db, ownerId: string, now: Date, range: ProgressRange, exerciseId: string | null): Promise<ProgressData> {
  const timeZone = await getTimeZone(db, ownerId);
  const today = localDateInfo(now, timeZone);

  const sessions = await db
    .select({ id: workoutSessions.id, startedAt: workoutSessions.startedAt, snapshot: workoutSessions.planSnapshot })
    .from(workoutSessions)
    .where(eq(workoutSessions.status, "completed"))
    .orderBy(asc(workoutSessions.startedAt));
  const sessionDate = new Map(sessions.map((s) => [s.id, localDateInfo(s.startedAt, timeZone).isoDate]));

  const firstUse = await (async () => {
    const [p] = await db.select({ createdAt: trainingPrograms.createdAt }).from(trainingPrograms).orderBy(asc(trainingPrograms.createdAt)).limit(1);
    const candidates = [p ? localDateInfo(p.createdAt, timeZone).isoDate : null, sessions[0] ? sessionDate.get(sessions[0].id)! : null].filter(
      (d): d is string => d !== null,
    );
    return candidates.sort()[0] ?? today.isoDate;
  })();

  const rangeStart = range === "all" ? firstUse : [addDays(today.isoDate, -RANGE_DAYS[range] + 1), firstUse].sort().at(-1)!;
  const inRange = sessions.filter((s) => sessionDate.get(s.id)! >= rangeStart);

  // Planned training days from first use (or range start) up to today, from the schedule.
  const program = await loadActiveProgram(db);
  const pastDates: string[] = [];
  for (let d = rangeStart; d <= today.isoDate && pastDates.length < 400; d = addDays(d, 1)) pastDates.push(d);
  const schedule = await resolveRange(db, program, pastDates);
  const isTraining = (d: string) => {
    const k = schedule.get(d)?.day?.kind;
    return k === "strength" || k === "choice";
  };
  const plannedInRange = pastDates.filter(isTraining).length;

  // Sets of every completed session (all time: records need the full history).
  const logs = sessions.length
    ? await db
        .select({ log: setLogs, name: exercises.name })
        .from(setLogs)
        .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
        .where(and(inArray(setLogs.sessionId, sessions.map((s) => s.id)), eq(setLogs.completed, true)))
    : [];

  // Per exercise, per session aggregates.
  const byExercise = new Map<string, { name: string; points: Map<string, ExercisePoint> }>();
  for (const { log, name } of logs) {
    const entry = byExercise.get(log.exerciseId) ?? { name, points: new Map() };
    const date = sessionDate.get(log.sessionId)!;
    const p = entry.points.get(log.sessionId) ?? {
      date,
      sessionId: log.sessionId,
      maxWeightKg: null,
      repsAtMax: null,
      maxReps: null,
      maxDurationSeconds: null,
      volumeKg: null,
      sets: 0,
    };
    const w = log.weightKg === null ? null : Number(log.weightKg);
    p.sets++;
    if (w !== null && (p.maxWeightKg === null || w > p.maxWeightKg || (w === p.maxWeightKg && (log.reps ?? 0) > (p.repsAtMax ?? 0)))) {
      p.maxWeightKg = w;
      p.repsAtMax = log.reps;
    }
    if (w === null && log.reps !== null) p.maxReps = Math.max(p.maxReps ?? 0, log.reps);
    if (log.durationSeconds !== null) p.maxDurationSeconds = Math.max(p.maxDurationSeconds ?? 0, log.durationSeconds);
    if (w !== null && log.reps !== null) p.volumeKg = (p.volumeKg ?? 0) + w * log.reps;
    entry.points.set(log.sessionId, p);
    byExercise.set(log.exerciseId, entry);
  }

  const achievements: Achievement[] = [];
  const summaries: ExerciseSummary[] = [];
  const allPoints = new Map<string, ExercisePoint[]>();
  for (const [id, { name, points }] of byExercise) {
    const list = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
    allPoints.set(id, list);
    const metric = metricOf(list);
    let best: number | null = null;
    let bestDate: string | null = null;
    for (const p of list) {
      const v = valueOf(p, metric);
      if (v === null) continue;
      if (best !== null && v > best) achievements.push({ date: p.date, kind: "record", text: name, metric, value: v, previous: best });
      if (best === null || v > best) {
        best = v;
        bestDate = p.date;
      }
    }
    summaries.push({ id, name, metric, sessions: list.length, best, bestDate });
  }
  summaries.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, "fr"));

  [1, 10, 25, 50, 100, 200].forEach((n) => {
    const s = sessions[n - 1];
    if (s) achievements.push({ date: sessionDate.get(s.id)!, kind: "milestone", text: n === 1 ? "Première séance enregistrée" : `${n}e séance terminée` });
  });
  achievements.sort((a, b) => b.date.localeCompare(a.date));

  // Weekly bars: 8 weeks for 8w, otherwise up to 26 weeks.
  const weekCount = range === "8w" ? 8 : 26;
  const thisMonday = weekDates(today.isoDate, today.weekday)[0]!;
  const volumeByDate = new Map<string, number>();
  for (const pts of allPoints.values()) for (const p of pts) if (p.volumeKg !== null) volumeByDate.set(p.date, (volumeByDate.get(p.date) ?? 0) + p.volumeKg);
  const weeks: WeekBar[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    if (addDays(start, 6) < firstUse) continue; // before the app was used: no bar at all, not a zero
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    const vol = days.reduce<number | null>((v, d) => (volumeByDate.has(d) ? (v ?? 0) + volumeByDate.get(d)! : v), null);
    weeks.push({
      weekStart: start,
      label: shortDate(start),
      completed: sessions.filter((s) => days.includes(sessionDate.get(s.id)!)).length,
      // Planned so far: from first use up to today (future days of this week are not "missed" yet).
      planned: days.filter((d) => d >= firstUse && d <= today.isoDate && isTraining(d)).length,
      volumeKg: vol === null ? null : Math.round(vol),
    });
  }

  // Default: the most practised lift with a weight (the most telling curve), else the most practised exercise.
  const chosen = summaries.find((s) => s.id === exerciseId) ?? summaries.find((s) => s.metric === "weight" && s.sessions >= 2) ?? summaries[0] ?? null;
  const selected = chosen
    ? { ...chosen, points: (allPoints.get(chosen.id) ?? []).filter((p) => p.date >= rangeStart) }
    : null;

  return {
    range,
    completedInRange: inRange.length,
    completedAllTime: sessions.length,
    plannedInRange,
    // Sessions done / sessions planned, capped at 100 %. Null (not 0 %) before anything was planned.
    consistency: plannedInRange > 0 ? Math.min(1, inRange.length / plannedInRange) : null,
    trainedWeeks: new Set(inRange.map((s) => mondayOf(sessionDate.get(s.id)!))).size,
    weeks,
    exercises: summaries,
    selected,
    achievements: achievements.slice(0, 8),
  };
}
