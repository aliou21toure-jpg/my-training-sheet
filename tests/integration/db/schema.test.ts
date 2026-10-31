import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exercises,
  importBatches,
  ownerAccount,
  plannedExercises,
  setLogs,
  trainingPrograms,
  workoutBlocks,
  workoutSessions,
  workoutTemplates,
  workoutVariants,
} from "@/db/schema";
import { createTestDb, pgCode } from "./test-db";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
}, 30_000);
afterAll(async () => {
  await t?.close();
});

async function expectPgError(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, "the query should have failed").toBeDefined();
  expect(pgCode(caught)).toBe(code);
}

const UNIQUE = "23505";
const CHECK = "23514";
const RESTRICT = "23001"; // ON DELETE RESTRICT

/**
 * A finished session with BOTH timestamps set from the same clock.
 * (Mixing Node's new Date() with Postgres now() can put the end 1 ms
 * before the start — the end_after_start check rightly refuses that.)
 */
const finished = () => ({
  status: "completed" as const,
  startedAt: new Date(Date.now() - 60 * 60_000),
  endedAt: new Date(),
});

describe("migration", () => {
  it("creates the 14 tables", async () => {
    const res = await t.client.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(res.rows[0]?.n).toBe(14);
  });
});

describe("owner account", () => {
  it("accepts one owner and refuses a second one", async () => {
    await t.db.insert(ownerAccount).values({ email: "owner@example.test", passwordHash: "x" });
    await expectPgError(t.db.insert(ownerAccount).values({ email: "other@example.test", passwordHash: "y" }), UNIQUE);
  });

  it("refuses to bypass the singleton by setting it to false", async () => {
    await expectPgError(
      t.db.insert(ownerAccount).values({ email: "sneaky@example.test", passwordHash: "z", singleton: false }),
      CHECK,
    );
  });
});

describe("program versions", () => {
  it("allows only one active program", async () => {
    await t.db.insert(trainingPrograms).values({ version: 1, isActive: true });
    await t.db.insert(trainingPrograms).values({ version: 2, isActive: false });
    await expectPgError(t.db.insert(trainingPrograms).values({ version: 3, isActive: true }), UNIQUE);
  });

  it("refuses the same file imported twice", async () => {
    const batch = { fileName: "a.xlsx", fileSha256: "a".repeat(64), fileSize: 10 };
    await t.db.insert(importBatches).values(batch);
    await expectPgError(t.db.insert(importBatches).values({ ...batch, fileName: "renamed.xlsx" }), UNIQUE);
  });

  it("refuses a weekday outside 1–7 and inverted rep ranges", async () => {
    const [program] = await t.db.insert(trainingPrograms).values({ version: 10 }).returning();
    await expectPgError(
      t.db.insert(workoutTemplates).values({ programId: program!.id, weekday: 8, kind: "strength" }),
      CHECK,
    );

    const [template] = await t.db
      .insert(workoutTemplates)
      .values({ programId: program!.id, weekday: 1, kind: "strength" })
      .returning();
    const [variant] = await t.db.insert(workoutVariants).values({ templateId: template!.id, number: 1, label: "Séance" }).returning();
    const [block] = await t.db
      .insert(workoutBlocks)
      .values({ variantId: variant!.id, position: 1, kind: "strength", name: "Strength", rawTitle: "Strength - 60 min" })
      .returning();
    const [exercise] = await t.db.insert(exercises).values({ name: "Leg press" }).returning();

    await expectPgError(
      t.db.insert(plannedExercises).values({
        blockId: block!.id,
        exerciseId: exercise!.id,
        position: 1,
        rawName: "Leg press",
        repsMin: 12,
        repsMax: 8,
      }),
      CHECK,
    );
  });

  it("treats exercise names case-insensitively", async () => {
    await t.db.insert(exercises).values({ name: "Hip thrust" });
    await expectPgError(t.db.insert(exercises).values({ name: "HIP THRUST" }), UNIQUE);
  });

  it("deleting a program removes its plan but cannot remove a shared exercise in use", async () => {
    const [program] = await t.db.insert(trainingPrograms).values({ version: 20 }).returning();
    const [template] = await t.db.insert(workoutTemplates).values({ programId: program!.id, weekday: 2, kind: "strength" }).returning();
    const [variant] = await t.db.insert(workoutVariants).values({ templateId: template!.id, number: 1, label: "Séance" }).returning();
    const [block] = await t.db
      .insert(workoutBlocks)
      .values({ variantId: variant!.id, position: 1, kind: "strength", name: "Strength", rawTitle: "Strength" })
      .returning();
    const [exercise] = await t.db.insert(exercises).values({ name: "Bench press" }).returning();
    await t.db.insert(plannedExercises).values({ blockId: block!.id, exerciseId: exercise!.id, position: 1, rawName: "Bench press" });

    await expectPgError(t.db.delete(exercises).where(eq(exercises.id, exercise!.id)), RESTRICT);

    await t.db.delete(trainingPrograms).where(eq(trainingPrograms.id, program!.id));
    const left = await t.db.select().from(plannedExercises).where(eq(plannedExercises.blockId, block!.id));
    expect(left).toHaveLength(0);
  });
});

describe("workout sessions", () => {
  const snapshot = { title: "Push", blocks: [] };

  it("allows only one in-progress or paused session at a time", async () => {
    const [first] = await t.db.insert(workoutSessions).values({ planSnapshot: snapshot, idempotencyKey: randomUUID() }).returning();
    expect(first!.isActive).toBe(true);

    await expectPgError(
      t.db.insert(workoutSessions).values({ planSnapshot: snapshot, idempotencyKey: randomUUID(), status: "paused" }),
      UNIQUE,
    );

    // Once finished, a new session can start.
    await t.db.update(workoutSessions).set({ ...finished() }).where(eq(workoutSessions.id, first!.id));
    const [second] = await t.db.insert(workoutSessions).values({ planSnapshot: snapshot, idempotencyKey: randomUUID() }).returning();
    expect(second!.isActive).toBe(true);
    await t.db.update(workoutSessions).set({ status: "abandoned", endedAt: new Date() }).where(eq(workoutSessions.id, second!.id));
  });

  it("ignores a double-tap: the same idempotency key cannot create two sessions", async () => {
    const key = randomUUID();
    const [s] = await t.db.insert(workoutSessions).values({ planSnapshot: snapshot, idempotencyKey: key, ...finished() }).returning();
    expect(s).toBeDefined();
    await expectPgError(
      t.db.insert(workoutSessions).values({ planSnapshot: snapshot, idempotencyKey: key, ...finished() }),
      UNIQUE,
    );
  });

  it("refuses an end time before the start time", async () => {
    await expectPgError(
      t.db.insert(workoutSessions).values({
        planSnapshot: snapshot,
        idempotencyKey: randomUUID(),
        status: "completed",
        startedAt: new Date("2026-11-02T10:00:00Z"),
        endedAt: new Date("2026-11-02T09:00:00Z"),
      }),
      CHECK,
    );
  });

  it("stores one row per set, refuses duplicates and negative values, keeps missing values null", async () => {
    const [session] = await t.db
      .insert(workoutSessions)
      .values({ planSnapshot: snapshot, idempotencyKey: randomUUID(), ...finished() })
      .returning();
    const [exercise] = await t.db.insert(exercises).values({ name: "Incline dumbbell press" }).returning();
    const base = { sessionId: session!.id, exerciseId: exercise!.id, snapshotKey: "v1.b1.e2" };

    const [logged] = await t.db.insert(setLogs).values({ ...base, setNumber: 1, weightKg: "14.5", reps: 10, completed: true }).returning();
    expect(logged!.weightKg).toBe("14.50");

    const [unweighted] = await t.db.insert(setLogs).values({ ...base, setNumber: 2, reps: 9 }).returning();
    expect(unweighted!.weightKg).toBeNull(); // missing, not zero

    await expectPgError(t.db.insert(setLogs).values({ ...base, setNumber: 1, reps: 8 }), UNIQUE);
    await expectPgError(t.db.insert(setLogs).values({ ...base, setNumber: 3, reps: -1 }), CHECK);
    await expectPgError(t.db.insert(setLogs).values({ ...base, setNumber: 0, reps: 5 }), CHECK);
  });

  it("keeps history when the plan it came from is deleted", async () => {
    const [program] = await t.db.insert(trainingPrograms).values({ version: 30 }).returning();
    const [session] = await t.db
      .insert(workoutSessions)
      .values({ planSnapshot: { title: "Pull", programVersion: 30 }, idempotencyKey: randomUUID(), ...finished() })
      .returning();

    await t.db.delete(trainingPrograms).where(eq(trainingPrograms.id, program!.id));

    const [still] = await t.db.select().from(workoutSessions).where(eq(workoutSessions.id, session!.id));
    expect(still!.planSnapshot).toEqual({ title: "Pull", programVersion: 30 });
  });
});
