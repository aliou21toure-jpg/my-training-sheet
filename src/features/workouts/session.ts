/**
 * Workout sessions: start, log sets, pause, finish.
 *
 * Every function takes the database as a parameter (testable on PGlite)
 * and uses the database clock (now()) for timestamps, so start, pause and
 * end times can never disagree.
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { exercises, setLogs, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadActiveProgram } from "@/features/program/load-program";
import { resolveRange } from "@/features/schedule/schedule";
import { buildSnapshot, findSnapshotExercise, type WorkoutSnapshot } from "./snapshot";
import type { LoggedSet, PersonalBest } from "./summary";

export type WorkoutErrorCode = "no_program" | "rest_day" | "not_found" | "not_active" | "unknown_exercise" | "invalid";

export class WorkoutError extends Error {
  constructor(
    public readonly code: WorkoutErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const ACTIVE = ["in_progress", "paused"] as const;

function isUniqueViolation(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Seconds of actual training: wall time minus pauses, computed by Postgres. */
const activeSecondsSql = sql<number>`greatest(0, extract(epoch from (coalesce(${workoutSessions.endedAt}, now()) - ${workoutSessions.startedAt}))
  - ${workoutSessions.pausedTotalSeconds}
  - coalesce(extract(epoch from (now() - ${workoutSessions.pausedAt})), 0))::float8`;

/* ---------- start ---------- */

export const startInputSchema = z.object({
  /** Local calendar date of the workout ("2026-11-02"). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  option: z.number().int().min(1).max(20).optional(),
  idempotencyKey: z.string().uuid(),
});

export async function startWorkout(db: Db, input: z.input<typeof startInputSchema>): Promise<{ sessionId: string; resumed: boolean }> {
  const { date, option, idempotencyKey } = startInputSchema.parse(input);

  // Same tap sent twice → the same session.
  const [sameKey] = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.idempotencyKey, idempotencyKey));
  if (sameKey) return { sessionId: sameKey.id, resumed: true };

  // Only one workout at a time: an unfinished one is resumed, not duplicated.
  const [active] = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.isActive, true));
  if (active) return { sessionId: active.id, resumed: true };

  const program = await loadActiveProgram(db);
  if (!program) throw new WorkoutError("no_program", "Aucun programme importé.");
  // The calendar decides what this date holds (moved workouts, Saturday option chosen in advance).
  const scheduled = (await resolveRange(db, program, [date])).get(date)!;
  const day = scheduled.day;
  if (!day || day.kind === "rest" || day.kind === "recovery" || day.variants.length === 0) {
    throw new WorkoutError("rest_day", "Pas de séance prévue ce jour-là.");
  }
  const variant = day.variants.find((v) => v.number === (option ?? scheduled.optionNumber)) ?? day.variants[0]!;

  // Sections without exercise rows (HIIT, swim) get a catalogue entry so their duration has a history.
  const sectionIds = new Map<string, string>();
  for (const block of variant.blocks) {
    if (block.exercises.length > 0) continue;
    const [found] = await db.select({ id: exercises.id }).from(exercises).where(sql`lower(${exercises.name}) = lower(${block.name})`);
    const id = found?.id ?? (await db.insert(exercises).values({ name: block.name }).onConflictDoNothing().returning({ id: exercises.id }))[0]?.id;
    if (id) sectionIds.set(block.id, id);
  }

  const snapshot = buildSnapshot(day, variant, program.version, sectionIds);
  try {
    const [created] = await db
      .insert(workoutSessions)
      .values({ planSnapshot: snapshot as unknown as Record<string, unknown>, idempotencyKey })
      .returning({ id: workoutSessions.id });
    return { sessionId: created!.id, resumed: false };
  } catch (error) {
    // Lost a race (double tap, two tabs): return whichever session won.
    if (!isUniqueViolation(error)) throw error;
    const [winner] = await db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(sql`${workoutSessions.idempotencyKey} = ${idempotencyKey} or ${workoutSessions.isActive}`)
      .limit(1);
    if (!winner) throw error;
    return { sessionId: winner.id, resumed: true };
  }
}

/* ---------- read ---------- */

export interface SessionView {
  id: string;
  status: (typeof workoutSessions.$inferSelect)["status"];
  startedAt: Date;
  endedAt: Date | null;
  pausedAt: Date | null;
  activeSeconds: number;
  notes: string | null;
  snapshot: WorkoutSnapshot;
  logs: LoggedSet[];
}

const toLogged = (r: typeof setLogs.$inferSelect): LoggedSet => ({
  snapshotKey: r.snapshotKey,
  exerciseId: r.exerciseId,
  setNumber: r.setNumber,
  weightKg: r.weightKg === null ? null : Number(r.weightKg),
  reps: r.reps,
  durationSeconds: r.durationSeconds,
  completed: r.completed,
});

export async function getSession(db: Db, sessionId: string): Promise<SessionView | null> {
  if (!z.string().uuid().safeParse(sessionId).success) return null;
  const [row] = await db
    .select({ s: workoutSessions, activeSeconds: activeSecondsSql })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (!row) return null;
  const logs = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.sessionId, sessionId))
    .orderBy(asc(setLogs.snapshotKey), asc(setLogs.setNumber));
  return {
    id: row.s.id,
    status: row.s.status,
    startedAt: row.s.startedAt,
    endedAt: row.s.endedAt,
    pausedAt: row.s.pausedAt,
    activeSeconds: Number(row.activeSeconds),
    notes: row.s.notes,
    snapshot: row.s.planSnapshot as unknown as WorkoutSnapshot,
    logs: logs.map(toLogged),
  };
}

export async function getActiveSessionId(db: Db): Promise<string | null> {
  const [row] = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.isActive, true));
  return row?.id ?? null;
}

async function requireActive(db: Db, sessionId: string) {
  if (!z.string().uuid().safeParse(sessionId).success) throw new WorkoutError("not_found", "Séance introuvable.");
  const [s] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId));
  if (!s) throw new WorkoutError("not_found", "Séance introuvable.");
  if (s.status !== "in_progress" && s.status !== "paused") {
    throw new WorkoutError("not_active", "Cette séance est déjà terminée.");
  }
  return s;
}

/* ---------- sets ---------- */

export const setInputSchema = z.object({
  sessionId: z.string().uuid(),
  snapshotKey: z.string().regex(/^b\d{1,2}\.e\d{1,2}$/),
  setNumber: z.number().int().min(1).max(30),
  weightKg: z.number().min(0).max(999.75).nullable(),
  reps: z.number().int().min(0).max(999).nullable(),
  durationSeconds: z.number().int().min(0).max(6 * 3600).nullable(),
  completed: z.boolean(),
});
export type SetInput = z.infer<typeof setInputSchema>;

/** Creates or updates one set. Sending the same set twice updates it — never a duplicate row. */
export async function logSet(db: Db, input: unknown): Promise<LoggedSet> {
  const parsed = setInputSchema.safeParse(input);
  if (!parsed.success) throw new WorkoutError("invalid", "Valeurs invalides.");
  const v = parsed.data;

  const session = await requireActive(db, v.sessionId);
  const exercise = findSnapshotExercise(session.planSnapshot as unknown as WorkoutSnapshot, v.snapshotKey);
  if (!exercise) throw new WorkoutError("unknown_exercise", "Exercice absent de cette séance.");

  const weight = v.weightKg === null ? null : (Math.round(v.weightKg * 100) / 100).toFixed(2);
  const [row] = await db
    .insert(setLogs)
    .values({
      sessionId: v.sessionId,
      exerciseId: exercise.exerciseId,
      snapshotKey: v.snapshotKey,
      setNumber: v.setNumber,
      weightKg: weight,
      reps: v.reps,
      durationSeconds: v.durationSeconds,
      completed: v.completed,
      completedAt: v.completed ? sql`now()` : null,
    })
    .onConflictDoUpdate({
      target: [setLogs.sessionId, setLogs.snapshotKey, setLogs.setNumber],
      set: {
        weightKg: weight,
        reps: v.reps,
        durationSeconds: v.durationSeconds,
        completed: v.completed,
        // Keep the first completion time when a completed set is edited.
        completedAt: v.completed ? sql`coalesce(${setLogs.completedAt}, now())` : null,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return toLogged(row!);
}

export async function removeSet(db: Db, input: { sessionId: string; snapshotKey: string; setNumber: number }) {
  await requireActive(db, input.sessionId);
  await db
    .delete(setLogs)
    .where(and(eq(setLogs.sessionId, input.sessionId), eq(setLogs.snapshotKey, input.snapshotKey), eq(setLogs.setNumber, input.setNumber)));
}

/* ---------- pause / finish ---------- */

export async function pauseSession(db: Db, sessionId: string) {
  await requireActive(db, sessionId);
  await db
    .update(workoutSessions)
    .set({ status: "paused", pausedAt: sql`now()` })
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.status, "in_progress")));
}

export async function resumeSession(db: Db, sessionId: string) {
  await requireActive(db, sessionId);
  await db
    .update(workoutSessions)
    .set({
      status: "in_progress",
      pausedTotalSeconds: sql`${workoutSessions.pausedTotalSeconds} + floor(extract(epoch from (now() - ${workoutSessions.pausedAt})))::int`,
      pausedAt: null,
    })
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.status, "paused")));
}

export async function saveNotes(db: Db, sessionId: string, notes: string) {
  await requireActive(db, sessionId);
  await db.update(workoutSessions).set({ notes: notes.slice(0, 2000) || null }).where(eq(workoutSessions.id, sessionId));
}

/** Finishing twice is harmless: the second call returns the already finished session. */
export async function finishSession(db: Db, sessionId: string, notes?: string): Promise<{ alreadyFinished: boolean }> {
  if (!z.string().uuid().safeParse(sessionId).success) throw new WorkoutError("not_found", "Séance introuvable.");
  const updated = await db
    .update(workoutSessions)
    .set({
      status: "completed",
      endedAt: sql`now()`,
      pausedTotalSeconds: sql`${workoutSessions.pausedTotalSeconds} + coalesce(floor(extract(epoch from (now() - ${workoutSessions.pausedAt})))::int, 0)`,
      pausedAt: null,
      ...(notes !== undefined ? { notes: notes.slice(0, 2000) || null } : {}),
    })
    .where(and(eq(workoutSessions.id, sessionId), inArray(workoutSessions.status, [...ACTIVE])))
    .returning({ id: workoutSessions.id });
  if (updated.length > 0) return { alreadyFinished: false };

  const [s] = await db.select({ status: workoutSessions.status }).from(workoutSessions).where(eq(workoutSessions.id, sessionId));
  if (s?.status === "completed") return { alreadyFinished: true };
  throw new WorkoutError(s ? "not_active" : "not_found", s ? "Cette séance ne peut plus être terminée." : "Séance introuvable.");
}

/** Gives up an unfinished workout: kept as "abandoned", excluded from progress. */
export async function abandonSession(db: Db, sessionId: string) {
  await requireActive(db, sessionId);
  await db
    .update(workoutSessions)
    .set({ status: "abandoned", endedAt: sql`now()`, pausedAt: null })
    .where(eq(workoutSessions.id, sessionId));
}

/* ---------- history ---------- */

/** The sets of the most recent COMPLETED session for each exercise. */
export async function getPreviousPerformance(
  db: Db,
  exerciseIds: string[],
  excludeSessionId: string,
): Promise<Map<string, LoggedSet[]>> {
  const result = new Map<string, LoggedSet[]>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select({ log: setLogs, endedAt: workoutSessions.endedAt })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        inArray(setLogs.exerciseId, exerciseIds),
        eq(workoutSessions.status, "completed"),
        eq(setLogs.completed, true),
        ne(workoutSessions.id, excludeSessionId),
      ),
    )
    .orderBy(desc(workoutSessions.endedAt), asc(setLogs.setNumber));

  const latestSession = new Map<string, string>();
  for (const { log } of rows) {
    const chosen = latestSession.get(log.exerciseId);
    if (chosen && chosen !== log.sessionId) continue;
    latestSession.set(log.exerciseId, log.sessionId);
    result.set(log.exerciseId, [...(result.get(log.exerciseId) ?? []), toLogged(log)]);
  }
  return result;
}

/** Best values ever recorded before this session, per exercise. */
export async function getPersonalBests(db: Db, exerciseIds: string[], excludeSessionId: string): Promise<Map<string, PersonalBest>> {
  const bests = new Map<string, PersonalBest>();
  if (exerciseIds.length === 0) return bests;
  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      maxWeight: sql<string | null>`max(${setLogs.weightKg})`,
      maxRepsNoWeight: sql<number | null>`max(${setLogs.reps}) filter (where ${setLogs.weightKg} is null)`,
      maxDuration: sql<number | null>`max(${setLogs.durationSeconds})`,
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        inArray(setLogs.exerciseId, exerciseIds),
        eq(workoutSessions.status, "completed"),
        eq(setLogs.completed, true),
        ne(workoutSessions.id, excludeSessionId),
      ),
    )
    .groupBy(setLogs.exerciseId);
  for (const r of rows) {
    bests.set(r.exerciseId, {
      maxWeightKg: r.maxWeight === null ? null : Number(r.maxWeight),
      maxReps: r.maxRepsNoWeight === null ? null : Number(r.maxRepsNoWeight),
      maxDurationSeconds: r.maxDuration === null ? null : Number(r.maxDuration),
    });
  }
  return bests;
}
