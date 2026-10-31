import { describe, expect, it } from "vitest";
import { parseDurationToSeconds, parseRest } from "@/features/import/parse-rest";

describe("parseDurationToSeconds", () => {
  it.each([
    ["90 s", 90],
    ["45s", 45],
    ["30 sec", 30],
    ["2 min", 120],
    ["2min", 120],
    ["2 min ", 120],
    ["1 min", 60],
    ["1min", 60],
    ["1min30", 90],
    ["1 min 30 s", 90],
    ["1:30", 90],
    ["1.5 min", 90],
  ])("%j → %i s", (text, seconds) => {
    expect(parseDurationToSeconds(text)).toBe(seconds);
  });

  it.each(["", "fast", "2 hours", "min", "12"])("rejects %j", (text) => {
    expect(parseDurationToSeconds(text)).toBeNull();
  });
});

describe("parseRest", () => {
  it("reads a normal rest period", () => {
    expect(parseRest("75 s")).toEqual({ sourceText: "75 s", seconds: 75, needsReview: false });
  });

  it("treats a dash as 'no rest', not as an error", () => {
    expect(parseRest("-")).toEqual({ sourceText: "-", seconds: null, needsReview: false });
  });

  it("treats an empty cell as 'no rest'", () => {
    expect(parseRest(null)).toEqual({ sourceText: "", seconds: null, needsReview: false });
  });

  it("keeps unknown text and flags it for review", () => {
    expect(parseRest("as needed")).toEqual({
      sourceText: "as needed",
      seconds: null,
      needsReview: true,
    });
  });
});
