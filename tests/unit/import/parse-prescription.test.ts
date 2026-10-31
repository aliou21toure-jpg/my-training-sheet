import { describe, expect, it } from "vitest";
import { parsePrescription } from "@/features/import/parse-prescription";

/*
 * Every format below appears in the real workbook. The strings are generic
 * training notation, not personal data, so they are safe to commit.
 */

describe("parsePrescription — repetitions", () => {
  it("reads a range taken to failure", () => {
    const p = parsePrescription("2 x 8-10 (Failure)");
    expect(p).toMatchObject({ sets: 2, target: { type: "reps", min: 8, max: 10 }, toFailure: true, needsReview: false });
  });

  it("reads a range written in parentheses with 'reps'", () => {
    expect(parsePrescription("2 x (6-8) reps")).toMatchObject({
      sets: 2,
      target: { type: "reps", min: 6, max: 8 },
      toFailure: false,
    });
  });

  it("reads parentheses + reps + failure together", () => {
    expect(parsePrescription("3 x (10-12) reps (Failure)")).toMatchObject({
      sets: 3,
      target: { type: "reps", min: 10, max: 12 },
      toFailure: true,
    });
  });

  it.each(["3x10-12 (Failure)", "2x 10-12", "3 x 10-12 ", "2 x 10-15 "])("tolerates spacing: %j", (text) => {
    const p = parsePrescription(text);
    expect(p.needsReview).toBe(false);
    expect(p.target?.type).toBe("reps");
  });

  it("reads a fixed rep count", () => {
    expect(parsePrescription("3 x 12")).toMatchObject({ sets: 3, target: { type: "reps", min: 12, max: 12 } });
  });

  it("reads max reps (AMRAP)", () => {
    expect(parsePrescription("2x max reps")).toMatchObject({ sets: 2, target: { type: "maxReps" } });
  });

  it("reads reps per side and per leg", () => {
    expect(parsePrescription("3 x 12 / side")).toMatchObject({ sets: 3, target: { min: 12, max: 12 }, perSide: true });
    expect(parsePrescription("4 x 10 / leg")).toMatchObject({ sets: 4, target: { min: 10, max: 10 }, perSide: true });
  });

  it("marks compound rows that apply to each exercise", () => {
    expect(parsePrescription("3 x 15 for each exercise")).toMatchObject({
      sets: 3,
      target: { type: "reps", min: 15, max: 15 },
      appliesToEachExercise: true,
      needsReview: false,
    });
  });
});

describe("parsePrescription — timed exercises", () => {
  it("reads a hold in seconds", () => {
    expect(parsePrescription("3 x 45 s")).toMatchObject({ sets: 3, target: { type: "duration", seconds: 45 } });
  });

  it("reads a timed hold per side", () => {
    expect(parsePrescription("3 x 30 s / side")).toMatchObject({
      sets: 3,
      target: { type: "duration", seconds: 30 },
      perSide: true,
    });
  });
});

describe("parsePrescription — never guesses", () => {
  it("keeps the original text on every result", () => {
    expect(parsePrescription("2 x 8-10 (Failure)").sourceText).toBe("2 x 8-10 (Failure)");
  });

  it("returns an empty, non-review result for a dash", () => {
    expect(parsePrescription("-")).toMatchObject({ sets: null, target: null, needsReview: false });
  });

  it.each([
    ["Bike: 30 s hard / 60 s easy, 8 rounds", "Format non reconnu"],
    ["as many as you can", "Format non reconnu"],
    ["3 x heavy", "Répétitions ou durée non reconnues"],
    ["50 x 10", "Nombre de séries inhabituel"],
    ["3 x 12-8", "Fourchette inversée"],
  ])("flags %j for review", (text, reason) => {
    const p = parsePrescription(text);
    expect(p.needsReview).toBe(true);
    expect(p.reviewReason).toContain(reason);
    expect(p.sourceText).toBe(text);
  });

  it("never throws on odd input", () => {
    for (const text of [undefined, null, "", "   ", "x", "x x x", "((("]) {
      expect(() => parsePrescription(text)).not.toThrow();
    }
  });
});
