/**
 * Personal data export. Everything the owner entered, nothing secret:
 * no password hash, no session tokens, no login attempts.
 */
import { asc, eq } from "drizzle-orm";
import { exercises, importBatches, personalSettings, plannedSessions, setLogs, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadActiveProgram } from "@/features/program/load-program";
import type { WorkoutSnapshot } from "@/features/workouts/snapshot";
import { localDateInfo } from "@/lib/dates/local-date";

export async function exportJson(db: Db, ownerId: string) {
  const [settings] = await db.select().from(personalSettings).where(eq(personalSettings.ownerId, ownerId));
  const sessions = await db.select().from(workoutSessions).orderBy(asc(workoutSessions.startedAt));
  const logs = await db
    .select({ log: setLogs, exercise: exercises.name })
    .from(setLogs)
    .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
    .orderBy(asc(setLogs.sessionId), asc(setLogs.snapshotKey), asc(setLogs.setNumber));

  return {
    exportedAt: new Date().toISOString(),
    format: "my-training-sheet/v1",
    settings: settings
      ? { displayName: settings.displayName, theme: settings.theme, unit: settings.unit, timezone: settings.timezone, reminderEnabled: settings.reminderEnabled, reminderTime: settings.reminderTime }
      : null,
    activeProgram: await loadActiveProgram(db),
    imports: (await db.select().from(importBatches)).map(({ fileName, fileSize, importedAt, report }) => ({ fileName, fileSize, importedAt, report })),
    calendarChanges: await db.select({ date: plannedSessions.date, movedFrom: plannedSessions.movedFrom }).from(plannedSessions),
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      notes: s.notes,
      steps: s.steps,
      plan: s.planSnapshot,
      sets: logs
        .filter((l) => l.log.sessionId === s.id)
        .map(({ log, exercise }) => ({
          exercise,
          snapshotKey: log.snapshotKey,
          setNumber: log.setNumber,
          weightKg: log.weightKg === null ? null : Number(log.weightKg),
          reps: log.reps,
          durationSeconds: log.durationSeconds,
          completed: log.completed,
          completedAt: log.completedAt,
        })),
    })),
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote when needed; neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per set, ready for Excel / Numbers. */
export async function exportCsv(db: Db, timeZone: string): Promise<string> {
  const rows = await db
    .select({ log: setLogs, exercise: exercises.name, startedAt: workoutSessions.startedAt, status: workoutSessions.status, snapshot: workoutSessions.planSnapshot })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
    .orderBy(asc(workoutSessions.startedAt), asc(setLogs.snapshotKey), asc(setLogs.setNumber));

  const header = ["date", "workout", "session_status", "exercise", "set", "weight_kg", "reps", "duration_s", "completed"];
  const lines = rows.map((r) =>
    [
      localDateInfo(r.startedAt, timeZone).isoDate,
      (r.snapshot as unknown as WorkoutSnapshot).title,
      r.status,
      r.exercise,
      r.log.setNumber,
      r.log.weightKg,
      r.log.reps,
      r.log.durationSeconds,
      r.log.completed ? "yes" : "no",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
