import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setLogs, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import {
  abandonSession,
  finishSession,
  getActiveSessionId,
  getPersonalBests,
  getPreviousPerformance,
  getSession,
  logSet,
  pauseSession,
  removeSet,
  resumeSession,
  startWorkout,
  WorkoutError,
} from "@/features/workouts/session";
import { findNewRecords, summarizeSession } from "@/features/workouts/summary";
import { buildSampleWorkbook, buildWorkbook, sampleSheets } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

async function importProgram(sheets = sampleSheets, name = "p.xlsx") {
  const bytes = sheets === sampleSheets ? await buildSampleWorkbook() : await buildWorkbook(sheets);
  const parsed = await parseWorkbook(bytes);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return saveProgramDraft(db, { program: parsed.program, issues: parsed.issues, fileName: name, fileSize: bytes.byteLength, fileSha256: workbookFingerprint(bytes) });
}

const set = (sessionId: string, snapshotKey: string, setNumber: number, v: Partial<{ weightKg: number | null; reps: number | null; durationSeconds: number | null; completed: boolean }> = {}) => ({
  sessionId,
  snapshotKey,
  setNumber,
  weightKg: null,
  reps: null,
  durationSeconds: null,
  completed: false,
  ...v,
});

async function expectWorkoutError(p: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(WorkoutError);
  expect((caught as WorkoutError).code).toBe(code);
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("starting a workout", () => {
  it("needs an imported program", async () => {
    await expectWorkoutError(startWorkout(db, { weekday: 1, idempotencyKey: randomUUID() }), "no_program");
  });

  it("refuses rest and recovery days", async () => {
    await importProgram();
    await expectWorkoutError(startWorkout(db, { weekday: 7, idempotencyKey: randomUUID() }), "rest_day");
    await expectWorkoutError(startWorkout(db, { weekday: 3, idempotencyKey: randomUUID() }), "rest_day");
  });

  it("freezes Monday's plan in a snapshot, optional sections included", async () => {
    const { sessionId, resumed } = await startWorkout(db, { weekday: 1, idempotencyKey: randomUUID() });
    expect(resumed).toBe(false);
    const s = await getSession(db, sessionId);
    expect(s!.status).toBe("in_progress");
    expect(s!.snapshot.blocks.map((b) => [b.key, b.kind, b.optional, b.exercises.length])).toEqual([
      ["b1", "strength", false, 3],
      ["b2", "abs", true, 3],
      ["b3", "finisher", true, 1], // text-only section → one timed entry
    ]);
    expect(s!.snapshot.blocks[0]!.exercises[0]).toMatchObject({ key: "b1.e1", name: "Squat", plannedSets: 2, plannedLabel: "2 × 8–10 · échec", restSeconds: 90, input: "weightReps" });
    expect(s!.snapshot.blocks[1]!.exercises[2]).toMatchObject({ name: "Plank", input: "duration", durationUnit: "s", targetSeconds: 45 });
    expect(s!.snapshot.blocks[2]!.exercises[0]).toMatchObject({ name: "Finisher", input: "duration", durationUnit: "min", targetSeconds: 900 });
  });

  it("resumes the unfinished workout instead of starting a second one", async () => {
    const active = await getActiveSessionId(db);
    const again = await startWorkout(db, { weekday: 2, idempotencyKey: randomUUID() });
    expect(again).toEqual({ sessionId: active, resumed: true });
  });
});

describe("logging sets", () => {
  let id: string;
  beforeAll(async () => {
    id = (await getActiveSessionId(db))!;
  });

  it("saves a set, then updates it instead of duplicating it", async () => {
    await logSet(db, set(id, "b1.e1", 1, { weightKg: 40, reps: 10, completed: true }));
    await logSet(db, set(id, "b1.e1", 1, { weightKg: 42.5, reps: 9, completed: true }));
    const rows = await db.select().from(setLogs).where(eq(setLogs.sessionId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weightKg: "42.50", reps: 9, completed: true });
    expect(rows[0]!.completedAt).not.toBeNull();
  });

  it("keeps a typed but not yet validated set (not completed)", async () => {
    const saved = await logSet(db, set(id, "b1.e1", 2, { weightKg: 42.5 }));
    expect(saved).toMatchObject({ weightKg: 42.5, reps: null, completed: false });
  });

  it("un-checking a set clears its completion time", async () => {
    await logSet(db, set(id, "b1.e2", 1, { reps: 12, completed: true }));
    await logSet(db, set(id, "b1.e2", 1, { reps: 12, completed: false }));
    const [row] = await db.select().from(setLogs).where(eq(setLogs.snapshotKey, "b1.e2"));
    expect(row).toMatchObject({ completed: false, completedAt: null });
  });

  it("stores timed exercises as a duration", async () => {
    const saved = await logSet(db, set(id, "b2.e3", 1, { durationSeconds: 50, completed: true }));
    expect(saved).toMatchObject({ durationSeconds: 50, weightKg: null, reps: null });
  });

  it("allows an extra set beyond the plan and removing it", async () => {
    await logSet(db, set(id, "b1.e1", 3, { weightKg: 40, reps: 8, completed: true }));
    await removeSet(db, { sessionId: id, snapshotKey: "b1.e1", setNumber: 3 });
    const rows = await db.select().from(setLogs).where(eq(setLogs.snapshotKey, "b1.e1"));
    expect(rows.map((r) => r.setNumber).sort()).toEqual([1, 2]);
  });

  it("refuses unknown exercises and invalid values", async () => {
    await expectWorkoutError(logSet(db, set(id, "b9.e9", 1, { reps: 5 })), "unknown_exercise");
    await expectWorkoutError(logSet(db, set(id, "b1.e1", 1, { reps: -3 })), "invalid");
    await expectWorkoutError(logSet(db, set(id, "b1.e1", 0, { reps: 3 })), "invalid");
    await expectWorkoutError(logSet(db, { ...set(id, "b1.e1", 1), weightKg: "40" }), "invalid");
    await expectWorkoutError(logSet(db, set(randomUUID(), "b1.e1", 1, { reps: 3 })), "not_found");
  });
});

describe("pause, resume, finish", () => {
  let id: string;
  beforeAll(async () => {
    id = (await getActiveSessionId(db))!;
  });

  it("pauses and resumes, counting the pause outside active time", async () => {
    await pauseSession(db, id);
    expect((await getSession(db, id))!.status).toBe("paused");
    // Pretend the pause started 10 minutes ago.
    await db.update(workoutSessions).set({ pausedAt: new Date(Date.now() - 600_000) }).where(eq(workoutSessions.id, id));
    await resumeSession(db, id);
    const [row] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, id));
    expect(row!.status).toBe("in_progress");
    expect(row!.pausedAt).toBeNull();
    expect(row!.pausedTotalSeconds).toBeGreaterThanOrEqual(599);
  });

  it("logging still works while paused (typing during a break)", async () => {
    await pauseSession(db, id);
    await logSet(db, set(id, "b1.e3", 1, { reps: 15, completed: true }));
    await resumeSession(db, id);
  });

  it("finishes once; a second tap is harmless", async () => {
    expect(await finishSession(db, id, "Bonne séance")).toEqual({ alreadyFinished: false });
    expect(await finishSession(db, id)).toEqual({ alreadyFinished: true });
    const s = await getSession(db, id);
    expect(s).toMatchObject({ status: "completed", notes: "Bonne séance" });
    expect(s!.endedAt).not.toBeNull();
    expect(await getActiveSessionId(db)).toBeNull();
  });

  it("refuses changes to a finished session", async () => {
    await expectWorkoutError(logSet(db, set(id, "b1.e1", 1, { reps: 1 })), "not_active");
    await expectWorkoutError(pauseSession(db, id), "not_active");
  });

  it("summarises without counting missing weights as zero", async () => {
    const s = (await getSession(db, id))!;
    const summary = summarizeSession(s.snapshot, s.logs, s.activeSeconds);
    expect(summary).toMatchObject({ completedSets: 3, exercisesDone: 3, plannedExercises: 3, volumeKg: 382.5, setsWithoutWeight: 2 });
  });
});

describe("history", () => {
  let first: string;
  let second: string;

  it("shows the previous session's sets and detects new records", async () => {
    first = (await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.status, "completed")))[0]!.id;
    second = (await startWorkout(db, { weekday: 1, idempotencyKey: randomUUID() })).sessionId;
    const s = (await getSession(db, second))!;
    const squatId = s.snapshot.blocks[0]!.exercises[0]!.exerciseId;

    const previous = await getPreviousPerformance(db, [squatId], second);
    expect(previous.get(squatId)!.map((l) => [l.setNumber, l.weightKg, l.reps])).toEqual([[1, 42.5, 9]]);

    await logSet(db, set(second, "b1.e1", 1, { weightKg: 45, reps: 8, completed: true }));
    await logSet(db, set(second, "b2.e3", 1, { durationSeconds: 40, completed: true })); // plank: worse than 50 s
    await finishSession(db, second);

    const done = (await getSession(db, second))!;
    const bests = await getPersonalBests(db, done.logs.map((l) => l.exerciseId), second);
    const records = findNewRecords(done.snapshot, done.logs, bests);
    expect(records).toEqual([{ exerciseId: squatId, name: "Squat", kind: "weight", value: 45, previous: 42.5 }]);
  });

  it("a first attempt is not a record", async () => {
    const s = (await getSession(db, second))!;
    expect(findNewRecords(s.snapshot, s.logs, new Map())).toEqual([]);
  });

  it("past sessions keep their plan after a new program is imported", async () => {
    const edited = structuredClone(sampleSheets);
    edited.Mon!.rows[5] = ["Front squat", "5 x 5", "3 min"];
    await importProgram(edited, "v2.xlsx");

    const old = (await getSession(db, first))!;
    expect(old.snapshot.programVersion).toBe(1);
    expect(old.snapshot.blocks[0]!.exercises[0]!.name).toBe("Squat");

    const fresh = await startWorkout(db, { weekday: 1, idempotencyKey: randomUUID() });
    const now = (await getSession(db, fresh.sessionId))!;
    expect(now.snapshot.programVersion).toBe(2);
    expect(now.snapshot.blocks[0]!.exercises[0]!.name).toBe("Front squat");
    await abandonSession(db, fresh.sessionId);
    expect((await getSession(db, fresh.sessionId))!.status).toBe("abandoned");
  });

  it("Saturday option 2: HIIT and swim become timed entries in minutes", async () => {
    const { sessionId } = await startWorkout(db, { weekday: 6, option: 2, idempotencyKey: randomUUID() });
    const s = (await getSession(db, sessionId))!;
    expect(s.snapshot).toMatchObject({ variantNumber: 2, variantLabel: "HIIT", title: "Option 2 · HIIT" });
    expect(s.snapshot.blocks.map((b) => [b.kind, b.exercises[0]?.durationUnit])).toEqual([
      ["hiit", "min"],
      ["swim", "min"],
    ]);
    await abandonSession(db, sessionId);
  });

  it("the same start key twice gives the same session", async () => {
    const key = randomUUID();
    const a = await startWorkout(db, { weekday: 2, idempotencyKey: key });
    await finishSession(db, a.sessionId);
    const b = await startWorkout(db, { weekday: 2, idempotencyKey: key });
    expect(b).toEqual({ sessionId: a.sessionId, resumed: true });
  });
});
