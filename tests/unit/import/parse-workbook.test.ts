import { beforeAll, describe, expect, it } from "vitest";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { MAX_WORKBOOK_BYTES, parseWorkbook } from "@/features/import/parse-workbook";
import type { DayDraft, ImportResult, ProgramDraft } from "@/features/import/types";
import { buildSampleWorkbook, buildWorkbook, sampleSheets } from "../../fixtures/sample-workbook";

let bytes: Uint8Array;
let result: ImportResult;
let program: ProgramDraft;
const day = (weekday: number): DayDraft => program.days.find((d) => d.weekday === weekday)!;

beforeAll(async () => {
  bytes = await buildSampleWorkbook();
  result = await parseWorkbook(bytes);
  if (!result.ok) throw new Error(result.error.message);
  program = result.program;
});

describe("file validation", () => {
  it("rejects a file that is not a zip / xlsx", async () => {
    const r = await parseWorkbook(new TextEncoder().encode("Day,Focus\nMonday,Legs"));
    expect(r).toMatchObject({ ok: false, error: { code: "not_xlsx" } });
  });

  it("rejects an empty upload", async () => {
    expect(await parseWorkbook(new Uint8Array())).toMatchObject({ ok: false, error: { code: "not_xlsx" } });
  });

  it("rejects a corrupted xlsx", async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await parseWorkbook(broken)).toMatchObject({ ok: false, error: { code: "corrupt" } });
  });

  it("rejects files over the size limit before reading them", async () => {
    const big = new Uint8Array(MAX_WORKBOOK_BYTES + 1);
    big.set([0x50, 0x4b, 0x03, 0x04]);
    expect(await parseWorkbook(big)).toMatchObject({ ok: false, error: { code: "too_large" } });
  });

  it("names the missing sheets", async () => {
    const rest = Object.fromEntries(Object.entries(sampleSheets).filter(([name]) => name !== "Fri" && name !== "Sat"));
    const r = await parseWorkbook(await buildWorkbook(rest));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("missing_sheets");
      expect(r.error.message).toContain("Fri");
      expect(r.error.message).toContain("Sat");
    }
  });

  it("finds sheets whatever their case or spacing", async () => {
    const renamed = Object.fromEntries(Object.entries(sampleSheets).map(([k, v]) => [` ${k.toUpperCase()} `, v]));
    expect((await parseWorkbook(await buildWorkbook(renamed))).ok).toBe(true);
  });
});

describe("week overview", () => {
  it("reads the title, the seven days and the session parts", () => {
    expect(program.title).toBe("Sample Training Program");
    expect(program.days).toHaveLength(7);
    expect(day(1)).toMatchObject({ focus: "Lower body + abs", durationText: "60 min" });
    expect(program.sessionParts.map((p) => [p.name, p.durationText])).toEqual([
      ["Warm-up", "6 min"],
      ["Cool-down", "4 min"],
    ]);
  });

  it("does not read merged title cells as exercises", () => {
    const names = program.days.flatMap((d) => d.variants.flatMap((v) => v.blocks.flatMap((b) => b.exercises.map((e) => e.name))));
    expect(names).not.toContain("Monday - Lower body + abs");
  });

  it("marks each day with the right kind", () => {
    expect(program.days.map((d) => d.kind)).toEqual([
      "strength", "strength", "recovery", "strength", "strength", "choice", "rest",
    ]);
  });
});

describe("strength days", () => {
  it("keeps exercise notes, alternatives and compound rows", () => {
    const [strength, abs] = day(1).variants[0]!.blocks;
    expect(strength!.exercises[0]).toMatchObject({ name: "Squat", note: "start light" });
    expect(strength!.exercises[1]!.name).toBe("Leg curl");
    expect(strength!.exercises[2]!.components).toEqual(["Calf raise", "Back extensions"]);
    expect(strength!.exercises[2]!.prescription.appliesToEachExercise).toBe(true);
    expect(abs!.exercises[1]!.alternatives).toEqual(["Cable crunch", "weighted crunch"]);
    expect(abs!.exercises[0]!.alternatives).toEqual([]);
  });

  it("attaches the 'abs if you have time' line to the abs section, not to strength", () => {
    const [strength, abs] = day(1).variants[0]!.blocks;
    expect(strength!.instructions).toEqual([]);
    expect(abs).toMatchObject({ kind: "abs", optional: true, selection: "pickOne" });
  });

  it("reads 'as many as you wish' as a free choice", () => {
    expect(day(2).variants[0]!.blocks[1]).toMatchObject({ kind: "abs", optional: true, selection: "pickAny" });
  });

  it("keeps an unmarked abs section mandatory (as written)", () => {
    expect(day(4).variants[0]!.blocks[1]).toMatchObject({ kind: "abs", optional: false, selection: "all" });
  });

  it("marks the finisher optional and keeps its text", () => {
    const finisher = day(1).variants[0]!.blocks[2]!;
    expect(finisher).toMatchObject({ kind: "finisher", optional: true, durationMinutes: 15 });
    expect(finisher.instructions[0]).toContain("Incline walk");
  });

  it("converts rest periods to seconds", () => {
    const thu = day(4).variants[0]!.blocks[0]!;
    expect(thu.exercises.map((e) => e.rest.seconds)).toEqual([120, 90]);
  });
});

describe("recovery day", () => {
  it("keeps the plan as text and reads the step target", () => {
    const wed = day(3);
    expect(wed.stepsTarget).toBe(10000);
    expect(wed.variants[0]!.blocks[0]).toMatchObject({ kind: "recovery", durationText: "30-40 min", durationMinutes: null });
    expect(wed.variants[0]!.blocks[0]!.instructions).toHaveLength(2);
  });
});

describe("Friday", () => {
  it("splits the prose circuit into rounds, rest and exercises", () => {
    const cond = day(5).variants[0]!.blocks[1]!;
    expect(cond).toMatchObject({ kind: "conditioning", rounds: 4, restBetweenRoundsSeconds: 60, durationMinutes: 12 });
    expect(cond.exercises.map((e) => [e.name, e.prescription.target])).toEqual([
      ["kettlebell swings", { type: "reps", min: 12, max: 12 }],
      ["mountain climbers", { type: "reps", min: 20, max: 20 }],
      ["burpees", { type: "reps", min: 10, max: 10 }],
      ["jump rope", { type: "duration", seconds: 30 }],
    ]);
  });

  it("keeps both durations and reports the gap instead of correcting it", () => {
    expect(day(5).durationText).toBe("60 min");
    const info = result.ok ? result.issues.find((i) => i.sheet === "Fri" && i.level === "info") : undefined;
    expect(info?.message).toContain("47 min");
  });
});

describe("Saturday options", () => {
  it("creates one variant per numbered option", () => {
    const sat = day(6);
    expect(sat.notes).toEqual(["Pick option 1, 2 or 3."]);
    expect(sat.variants.map((v) => [v.number, v.label])).toEqual([
      [1, "Circuit"],
      [2, "HIIT"],
      [3, "Conditioning"],
    ]);
  });

  it("reads circuit rounds, the rest-between-rounds row and per-leg reps", () => {
    const circuit = day(6).variants[0]!.blocks[0]!;
    expect(circuit).toMatchObject({ kind: "circuit", rounds: 4, restBetweenRoundsSeconds: 90 });
    expect(circuit.exercises.map((e) => e.name)).toEqual(["Goblet squat", "Step-ups on bench"]);
    expect(circuit.exercises[1]!.prescription.perSide).toBe(true);
    expect(day(6).variants[0]!.blocks[1]).toMatchObject({ kind: "core", rounds: 3 });
  });

  it("keeps HIIT as text with its 2 rounds and adds the swim after it", () => {
    const [hiit, swim] = day(6).variants[1]!.blocks;
    expect(hiit).toMatchObject({ kind: "hiit", rounds: 2, exercises: [] });
    expect(hiit!.instructions.join(" ")).toContain("30 s hard / 60 s easy");
    expect(swim).toMatchObject({ kind: "swim", optional: false, durationMinutes: null });
  });

  it("adds the swim after option 3 too, and reports its unknown duration", () => {
    expect(day(6).variants[2]!.blocks.map((b) => b.kind)).toEqual(["conditioning", "swim"]);
    const swimInfos = result.ok ? result.issues.filter((i) => i.message.startsWith("Natation")) : [];
    expect(swimInfos).toHaveLength(2);
  });
});

describe("never guesses", () => {
  it("flags unreadable cells for review and keeps the original text", () => {
    const issues = result.ok ? result.issues.filter((i) => i.level === "review") : [];
    expect(issues.map((i) => [i.sheet, i.sourceText])).toEqual([
      ["Thu", "3 x heavy"],
      ["Thu", "soon"],
    ]);
    const mystery = day(4).variants[0]!.blocks[1]!.exercises[1]!;
    expect(mystery.prescription).toMatchObject({ sourceText: "3 x heavy", needsReview: true });
  });
});

describe("rules sheet", () => {
  it("stores rules as reference notes, not targets", () => {
    expect(program.rules.map((r) => r.title)).toEqual(["Progressive overload", "Sleep and steps"]);
    expect(program.referenceNotes).toEqual(["Check with a professional if anything hurts."]);
  });
});

describe("duplicate detection", () => {
  it("gives the same fingerprint for the same bytes and a different one if a byte changes", () => {
    const copy = bytes.slice();
    const edited = bytes.slice();
    edited[edited.length - 1] = (edited[edited.length - 1]! + 1) % 256;
    expect(workbookFingerprint(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(workbookFingerprint(copy)).toBe(workbookFingerprint(bytes));
    expect(workbookFingerprint(edited)).not.toBe(workbookFingerprint(bytes));
  });
});
