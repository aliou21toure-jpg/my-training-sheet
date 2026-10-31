import { describe, expect, it } from "vitest";
import { parseCircuitText } from "@/features/import/parse-circuit-text";
import { parseExerciseName } from "@/features/import/parse-exercise-name";
import { looksLikeSectionTitle, parseSectionTitle } from "@/features/import/parse-section-title";

describe("parseExerciseName", () => {
  it.each([
    ["Leg extension (Quads)", { name: "Leg extension", note: "Quads", alternatives: [], components: [] }],
    ["Cable crunch (or weighted crunch)", { name: "Cable crunch", note: null, alternatives: ["Cable crunch", "weighted crunch"] }],
    ["Peck deck or cable fly", { name: "Peck deck or cable fly", alternatives: ["Peck deck", "cable fly"] }],
    ["Hanging or lying leg raise", { alternatives: [] }],
    ["Dumbell or Cable Latteral raises ", { name: "Dumbell or Cable Latteral raises", alternatives: [] }],
    ["Standing calf raise + Back extensions", { components: ["Standing calf raise", "Back extensions"] }],
    ["Single arm row (Cable, Dumbell or machine)", { name: "Single arm row", note: "Cable, Dumbell or machine", alternatives: [] }],
  ])("%j", (raw, expected) => {
    expect(parseExerciseName(raw)).toMatchObject(expected);
  });
});

describe("parseSectionTitle", () => {
  it("reads a numbered Saturday option with rounds and rest", () => {
    expect(parseSectionTitle("1) Circuit - 35 min (4 rounds, minimal rest inside a round, 90 s between rounds)")).toMatchObject({
      variantNumber: 1,
      name: "Circuit",
      kind: "circuit",
      durationMinutes: 35,
      rounds: 4,
      restBetweenRoundsSeconds: 90,
    });
  });

  it("keeps a duration range as text only", () => {
    expect(parseSectionTitle("Plan - 30-40 min", true)).toMatchObject({
      name: "Plan",
      kind: "recovery",
      durationText: "30-40 min",
      durationMinutes: null,
    });
  });

  it("reads 'Core - 10 min, 3 rounds'", () => {
    expect(parseSectionTitle("Core - 10 min, 3 rounds")).toMatchObject({ kind: "core", durationMinutes: 10, rounds: 3 });
  });

  it("recognises titles and rejects instructions", () => {
    expect(looksLikeSectionTitle("Finisher - 15 min", false)).toBe(true);
    expect(looksLikeSectionTitle("Abs ", true)).toBe(true);
    expect(looksLikeSectionTitle("2) HIIT -  Do 2 rounds", false)).toBe(true);
    expect(looksLikeSectionTitle("Abs if you have time (Pick one exercise from the below list)", true)).toBe(false);
    expect(looksLikeSectionTitle("Incline treadmill walk, 10-12% incline, brisk pace.", false)).toBe(false);
  });
});

describe("parseCircuitText", () => {
  it("returns null for text that is not a circuit", () => {
    expect(parseCircuitText("Bike: 30 s hard / 60 s easy, 8 rounds.")).toBeNull();
  });

  it("returns null rather than guessing when an item is unreadable", () => {
    expect(parseCircuitText("Circuit, 3 rounds: 10 squats, some lunges")).toBeNull();
  });

  it("separates the '+ Swim' extra", () => {
    expect(parseCircuitText("Circuit, 4 rounds: 10 burpees, 30 s jumping jacks. + Swim")).toMatchObject({
      rounds: 4,
      extras: ["Swim"],
      items: [
        { name: "burpees", reps: 10 },
        { name: "jumping jacks", durationSeconds: 30 },
      ],
    });
  });
});
