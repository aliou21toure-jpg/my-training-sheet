import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerAccount, personalSettings, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import { getProgress } from "@/features/progress/get-progress";
import { getSession, logSet, startWorkout } from "@/features/workouts/session";
import { buildSampleWorkbook } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";
import { eq, sql } from "drizzle-orm";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let ownerId: string;
let squatId: string;
const NOW = new Date("2026-11-01T12:00:00Z"); // Sunday

/** Logs a full Monday workout on a given local date, as if done at 18:00 Paris. */
async function mondayWorkout(date: string, squat: { kg: number | null; reps: number }[], plankSeconds?: number) {
  const { sessionId } = await startWorkout(db, { date, idempotencyKey: randomUUID() });
  for (const [i, s] of squat.entries()) {
    await logSet(db, { sessionId, snapshotKey: "b1.e1", setNumber: i + 1, weightKg: s.kg, reps: s.reps, durationSeconds: null, completed: true });
  }
  // A typed but NOT validated set: must not count.
  await logSet(db, { sessionId, snapshotKey: "b1.e1", setNumber: squat.length + 1, weightKg: 999, reps: 1, durationSeconds: null, completed: false });
  if (plankSeconds !== undefined) {
    await logSet(db, { sessionId, snapshotKey: "b2.e3", setNumber: 1, weightKg: null, reps: null, durationSeconds: plankSeconds, completed: true });
  }
  const start = new Date(`${date}T17:00:00Z`);
  await db
    .update(workoutSessions)
    .set({ status: "completed", startedAt: start, endedAt: new Date(start.getTime() + 3_600_000) })
    .where(eq(workoutSessions.id, sessionId));
  return (await getSession(db, sessionId))!;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  const [o] = await db.insert(ownerAccount).values({ email: "o@example.test", passwordHash: "x" }).returning();
  ownerId = o!.id;
  await db.insert(personalSettings).values({ ownerId, timezone: "Europe/Paris" });
  const bytes = await buildSampleWorkbook();
  const parsed = await parseWorkbook(bytes);
  if (!parsed.ok) throw new Error();
  await saveProgramDraft(db, { program: parsed.program, issues: parsed.issues, fileName: "p.xlsx", fileSize: 1, fileSha256: workbookFingerprint(bytes) });
  // Pretend the program was imported 3 weeks before "now".
  await db.execute(sql`update training_programs set created_at = '2026-10-12T10:00:00Z'`);
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("getProgress", () => {
  it("shows nothing invented before any workout", async () => {
    const p = await getProgress(db, ownerId, NOW, "8w", null);
    expect(p).toMatchObject({ completedAllTime: 0, completedInRange: 0, selected: null, achievements: [] });
    expect(p.consistency).toBe(0); // workouts were planned since the import, none done
    expect(p.weeks.every((w) => w.completed === 0)).toBe(true);
  });

  it("aggregates validated sets per session and finds records over time", async () => {
    const first = await mondayWorkout("2026-10-12", [{ kg: 40, reps: 10 }, { kg: 40, reps: 9 }], 40);
    squatId = first.snapshot.blocks[0]!.exercises[0]!.exerciseId;
    await mondayWorkout("2026-10-19", [{ kg: 42.5, reps: 8 }, { kg: 45, reps: 6 }], 50);
    await mondayWorkout("2026-10-26", [{ kg: null, reps: 15 }]); // bodyweight day: no weight entered

    const p = await getProgress(db, ownerId, NOW, "8w", squatId);
    expect(p.completedAllTime).toBe(3);
    expect(p.selected).toMatchObject({ id: squatId, name: "Squat", metric: "weight", best: 45, bestDate: "2026-10-19" });
    expect(p.selected!.points.map((x) => [x.date, x.maxWeightKg, x.repsAtMax, x.volumeKg, x.sets])).toEqual([
      ["2026-10-12", 40, 10, 760, 2],
      ["2026-10-19", 45, 6, 610, 2],
      ["2026-10-26", null, null, null, 1], // a gap, not zero
    ]);
    expect(p.achievements.filter((a) => a.kind === "record").map((a) => [a.text, a.value, a.previous])).toEqual(
      expect.arrayContaining([
        ["Squat", 45, 40],
        ["Plank", 50, 40],
      ]),
    );
    expect(p.achievements.some((a) => a.text === "Première séance enregistrée")).toBe(true);
  });

  it("computes consistency from the schedule since first use", async () => {
    const p = await getProgress(db, ownerId, NOW, "8w", null);
    // From Mon 12 Oct to Sun 1 Nov: 3 weeks × 5 training days = 15 planned, 3 done.
    expect(p.plannedInRange).toBe(15);
    expect(p.consistency).toBeCloseTo(0.2);
    expect(p.trainedWeeks).toBe(3);
    expect(p.weeks.map((w) => [w.weekStart, w.completed, w.planned])).toEqual([
      ["2026-10-12", 1, 5],
      ["2026-10-19", 1, 5],
      ["2026-10-26", 1, 5],
    ]);
  });

  it("filters the chart by range but keeps all-time records", async () => {
    const recent = await getProgress(db, ownerId, new Date("2026-12-20T12:00:00Z"), "8w", squatId);
    expect(recent.selected!.points.map((x) => x.date)).toEqual(["2026-10-26"]);
    expect(recent.selected!.best).toBe(45);
  });

  it("picks the right metric for timed exercises", async () => {
    const p = await getProgress(db, ownerId, NOW, "all", null);
    expect(p.exercises.find((e) => e.name === "Plank")).toMatchObject({ metric: "duration", best: 50 });
  });
});
