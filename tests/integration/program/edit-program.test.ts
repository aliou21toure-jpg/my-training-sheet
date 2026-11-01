import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exercises, trainingPrograms } from "@/db/schema";
import type { Db } from "@/db/types";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import { normalizeDraft, programToDraft, saveEditedProgram } from "@/features/program/edit-program";
import { loadActiveProgram } from "@/features/program/load-program";
import { getSession, logSet, startWorkout, finishSession } from "@/features/workouts/session";
import { buildSampleWorkbook } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let pastSession: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  const bytes = await buildSampleWorkbook();
  const parsed = await parseWorkbook(bytes);
  if (!parsed.ok) throw new Error();
  await saveProgramDraft(db, { program: parsed.program, issues: parsed.issues, fileName: "p.xlsx", fileSize: 1, fileSha256: workbookFingerprint(bytes) });
  pastSession = (await startWorkout(db, { date: "2026-11-02", idempotencyKey: randomUUID() })).sessionId;
  await logSet(db, { sessionId: pastSession, snapshotKey: "b1.e1", setNumber: 1, weightKg: 40, reps: 10, durationSeconds: null, completed: true });
  await finishSession(db, pastSession);
}, 30_000);
afterAll(async () => {
  await t?.close();
});

const clone = <T,>(v: T) => structuredClone(v);

describe("program editor", () => {
  it("round-trips: saving the unchanged draft gives an identical program as version 2", async () => {
    const before = (await loadActiveProgram(db))!;
    const r = await saveEditedProgram(db, programToDraft(before));
    expect(r).toEqual({ ok: true, version: 2 });
    const after = (await loadActiveProgram(db))!;
    const strip = (p: typeof before) => p.days.map((d) => [d.weekday, d.kind, d.variants.map((v) => [v.label, v.blocks.map((b) => [b.kind, b.optional, b.exercises.map((e) => [e.exerciseId, e.name, e.prescription.target, e.prescription.sets, e.restSeconds])])])]);
    expect(strip(after)).toEqual(strip(before));
    expect(await db.select().from(trainingPrograms).where(eq(trainingPrograms.isActive, true))).toHaveLength(1);
  });

  it("edits sets, reps, rest, order, optional flag and fixes a row to review", async () => {
    const draft = programToDraft((await loadActiveProgram(db))!);
    const monday = draft.days[0]!.variants[0]!;
    const [squat, curl] = monday.blocks[0]!.exercises;
    squat!.prescription.sets = 4;
    squat!.prescription.target = { type: "reps", min: 6, max: 8 };
    squat!.rest.seconds = 150;
    monday.blocks[0]!.exercises = [curl!, squat!, ...monday.blocks[0]!.exercises.slice(2)];
    monday.blocks[1]!.optional = false;
    const thuAbs = draft.days[3]!.variants[0]!.blocks[1]!;
    const mystery = thuAbs.exercises.find((e) => e.name === "Mystery move")!;
    expect(mystery.prescription.needsReview).toBe(true);
    mystery.prescription = { ...mystery.prescription, sets: 3, target: { type: "reps", min: 8, max: 8 }, needsReview: false, reviewReason: null };

    expect(await saveEditedProgram(db, draft)).toEqual({ ok: true, version: 3 });
    const p = (await loadActiveProgram(db))!;
    const mon = p.days[0]!.variants[0]!;
    expect(mon.blocks[0]!.exercises.map((e) => e.name)).toEqual(["Leg curl", "Squat", "Calf raise + Back extensions"]);
    expect(mon.blocks[0]!.exercises[1]).toMatchObject({ restSeconds: 150, prescription: { sets: 4, target: { type: "reps", min: 6, max: 8 } } });
    expect(mon.blocks[1]!.optional).toBe(false);
    expect(p.days[3]!.variants[0]!.blocks[1]!.exercises.find((e) => e.name === "Mystery move")).toMatchObject({ needsReview: false, prescription: { sets: 3 } });
  });

  it("renaming an exercise keeps its history (typo fix)", async () => {
    const draft = programToDraft((await loadActiveProgram(db))!);
    const squat = draft.days[0]!.variants[0]!.blocks[0]!.exercises.find((e) => e.name === "Squat")!;
    const id = squat.exerciseId;
    squat.name = "Back squat";
    await saveEditedProgram(db, draft);
    const [row] = await db.select().from(exercises).where(eq(exercises.id, id!));
    expect(row!.name).toBe("Back squat");
    // The past session still has its own snapshot name, and the same exercise id.
    const past = (await getSession(db, pastSession))!;
    expect(past.snapshot.blocks[0]!.exercises[0]).toMatchObject({ name: "Squat", exerciseId: id });
  });

  it("renaming to an existing exercise joins it instead of renaming", async () => {
    const draft = programToDraft((await loadActiveProgram(db))!);
    const curl = draft.days[0]!.variants[0]!.blocks[0]!.exercises.find((e) => e.name === "Leg curl")!;
    curl.name = "plank"; // already exists (Monday abs), case-insensitive
    await saveEditedProgram(db, draft);
    const planks = await db.select().from(exercises).where(eq(exercises.name, "Plank"));
    expect(planks).toHaveLength(1);
    expect((await db.select().from(exercises).where(eq(exercises.name, "Leg curl")))).toHaveLength(1); // untouched
  });

  it("swapping two days and turning a day into rest", async () => {
    const draft = programToDraft((await loadActiveProgram(db))!);
    const [mon, tue] = [clone(draft.days[0]!), clone(draft.days[1]!)];
    draft.days[0] = { ...tue, weekday: 1 };
    draft.days[1] = { ...mon, weekday: 2 };
    draft.days[4]!.variants = []; // Friday → rest
    await saveEditedProgram(db, draft);
    const p = (await loadActiveProgram(db))!;
    expect(p.days[0]!.focus).toBe("Push day");
    expect(p.days[4]!.kind).toBe("rest");
  });

  it("refuses invalid drafts and changes nothing", async () => {
    const before = (await loadActiveProgram(db))!.version;
    const draft = programToDraft((await loadActiveProgram(db))!);
    const bad1 = clone(draft);
    bad1.days[0]!.variants[0]!.blocks[0]!.exercises[0]!.name = "  ";
    const bad2 = clone(draft);
    bad2.days[0]!.variants[0]!.blocks[0]!.exercises[0]!.prescription.target = { type: "reps", min: 12, max: 8 };
    const bad3 = clone(draft);
    bad3.days.pop();
    for (const bad of [bad1, bad2, bad3, { hello: "world" }, null]) {
      expect((await saveEditedProgram(db, bad)).ok).toBe(false);
    }
    expect((await loadActiveProgram(db))!.version).toBe(before);
  });

  it("normalizes day kinds and positions", () => {
    const draft = normalizeDraft({
      title: null,
      summary: null,
      sessionParts: [],
      rules: [],
      referenceNotes: [],
      days: [
        { weekday: 1, sheetName: null, title: null, focus: null, durationText: null, kind: "choice", stepsTarget: null, notes: [], variants: [{ number: 5, label: "A", blocks: [] }] },
      ],
    });
    expect(draft.days[0]).toMatchObject({ kind: "rest", variants: [] });
  });
});
