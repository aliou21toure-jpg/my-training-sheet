import { asc, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exercises,
  importBatches,
  plannedExercises,
  trainingPrograms,
  workoutBlocks,
  workoutTemplates,
  workoutVariants,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { summarizeImport } from "@/features/import/format";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft, type ImportInput } from "@/features/import/save-program";
import { buildSampleWorkbook, buildWorkbook, sampleSheets } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let input: ImportInput;

async function inputFrom(bytes: Uint8Array, fileName = "program.xlsx"): Promise<ImportInput> {
  const result = await parseWorkbook(bytes);
  if (!result.ok) throw new Error(result.error.message);
  return { program: result.program, issues: result.issues, fileName, fileSize: bytes.byteLength, fileSha256: workbookFingerprint(bytes) };
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  input = await inputFrom(await buildSampleWorkbook());
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("saveProgramDraft", () => {
  it("saves the whole program as version 1, active", async () => {
    const r = await saveProgramDraft(db, input);
    expect(r).toMatchObject({ ok: true, version: 1, exerciseCount: summarizeImport(input.program, input.issues).exercises });

    const programs = await db.select().from(trainingPrograms);
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({ version: 1, isActive: true, title: "Sample Training Program" });
    expect(programs[0]!.reference).toMatchObject({ rules: [{ title: "Progressive overload" }, { title: "Sleep and steps" }] });
  });

  it("stores 7 days, the 3 Saturday options and every planned exercise", async () => {
    const days = await db.select().from(workoutTemplates).orderBy(asc(workoutTemplates.weekday));
    expect(days.map((d) => d.kind)).toEqual(["strength", "strength", "recovery", "strength", "strength", "choice", "rest"]);
    expect(days[2]!.stepsTarget).toBe(10000);

    const saturday = await db.select().from(workoutVariants).where(eq(workoutVariants.templateId, days[5]!.id)).orderBy(asc(workoutVariants.number));
    expect(saturday.map((v) => v.label)).toEqual(["Circuit", "HIIT", "Conditioning"]);

    const [{ n }] = (await db.select({ n: count() }).from(plannedExercises)) as [{ n: number }];
    expect(n).toBe(summarizeImport(input.program, input.issues).exercises);
  });

  it("keeps the source text and maps prescriptions to columns", async () => {
    const [squat] = await db.select().from(plannedExercises).where(eq(plannedExercises.rawName, "Squat (start light)"));
    expect(squat).toMatchObject({
      note: "start light",
      sets: 2,
      targetType: "reps",
      repsMin: 8,
      repsMax: 10,
      toFailure: true,
      restSeconds: 90,
      sourceText: "2 x 8-10 (Failure)",
      needsReview: false,
    });

    const [sidePlank] = await db.select().from(plannedExercises).where(eq(plannedExercises.rawName, "Side plank"));
    expect(sidePlank).toMatchObject({ targetType: "duration", durationSeconds: 30, perSide: true, repsMin: null });
  });

  it("saves ambiguous rows flagged, with their original text", async () => {
    const [mystery] = await db.select().from(plannedExercises).where(eq(plannedExercises.rawName, "Mystery move"));
    expect(mystery).toMatchObject({ needsReview: true, sourceText: "3 x heavy", restSourceText: "soon", sets: 3, targetType: null });
  });

  it("stores each exercise name once (Plank appears on Monday and Tuesday)", async () => {
    const planks = await db.select().from(exercises).where(sql`lower(${exercises.name}) = 'plank'`);
    expect(planks).toHaveLength(1);
    const uses = await db.select().from(plannedExercises).where(eq(plannedExercises.exerciseId, planks[0]!.id));
    expect(uses).toHaveLength(2);
  });

  it("stores prose circuits as exercises and the swim as its own block", async () => {
    const blocks = await db.select().from(workoutBlocks).where(eq(workoutBlocks.kind, "swim"));
    expect(blocks).toHaveLength(2);
    const [conditioning] = await db.select().from(workoutBlocks).where(eq(workoutBlocks.name, "Conditioning")).limit(1);
    expect(conditioning).toMatchObject({ rounds: 4, restBetweenRoundsSeconds: 60 });
  });

  it("refuses the same file a second time and changes nothing", async () => {
    const before = await db.select({ n: count() }).from(plannedExercises);
    expect(await saveProgramDraft(db, { ...input, fileName: "renamed.xlsx" })).toEqual({ ok: false, reason: "duplicate", version: 1 });
    expect(await db.select({ n: count() }).from(plannedExercises)).toEqual(before);
    expect(await db.select().from(importBatches)).toHaveLength(1);
  });

  it("a different file becomes version 2 and the only active program; version 1 is kept", async () => {
    const edited = structuredClone(sampleSheets);
    edited.Tue!.rows.push(["Dips", "3 x 10", "90 s"]);
    const second = await inputFrom(await buildWorkbook(edited), "program-v2.xlsx");

    const r = await saveProgramDraft(db, second);
    expect(r).toMatchObject({ ok: true, version: 2 });

    const programs = await db.select().from(trainingPrograms).orderBy(asc(trainingPrograms.version));
    expect(programs.map((p) => [p.version, p.isActive])).toEqual([
      [1, false],
      [2, true],
    ]);
    // Version 1 still has all its planned exercises.
    const v1Days = await db.select().from(workoutTemplates).where(eq(workoutTemplates.programId, programs[0]!.id));
    expect(v1Days).toHaveLength(7);
    // The shared catalogue grew by one exercise only.
    const dips = await db.select().from(exercises).where(eq(exercises.name, "Dips"));
    expect(dips).toHaveLength(1);
  });

  it("rolls everything back if something fails mid-way", async () => {
    const broken = await inputFrom(await buildWorkbook({ ...structuredClone(sampleSheets), Mon: { rows: [["Monday"], ["Strength - 60 min"], ["Exercise", "Sets x Reps", "Rest"], ["Squat", "3 x 10", "90 s"]] } }), "broken.xlsx");
    // Force a constraint failure deep inside the transaction: a weekday out of range.
    broken.program.days[6]!.weekday = 9;

    await expect(saveProgramDraft(db, broken)).rejects.toThrow();

    const programs = await db.select().from(trainingPrograms);
    expect(programs).toHaveLength(2); // no half-saved version 3
    expect(programs.find((p) => p.isActive)?.version).toBe(2); // version 2 still active
    expect(await db.select().from(importBatches).where(eq(importBatches.fileName, "broken.xlsx"))).toHaveLength(0);
  });
});
