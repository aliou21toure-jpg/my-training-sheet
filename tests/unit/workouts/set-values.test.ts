import { describe, expect, it } from "vitest";
import { describePrevious, draftFromLog, formatClock, formatLogged, parseSetDraft, type SetDraft } from "@/features/workouts/set-values";
import type { LoggedSet } from "@/features/workouts/summary";

const draft = (v: Partial<SetDraft>): SetDraft => ({ setNumber: 1, weight: "", reps: "", duration: "", completed: false, ...v });
const strength = { input: "weightReps" as const, durationUnit: "s" as const };
const hold = { input: "duration" as const, durationUnit: "s" as const };
const swim = { input: "duration" as const, durationUnit: "min" as const };
const log = (v: Partial<LoggedSet>): LoggedSet => ({ snapshotKey: "b1.e1", exerciseId: "x", setNumber: 1, weightKg: null, reps: null, durationSeconds: null, completed: true, ...v });

describe("parseSetDraft", () => {
  it("accepts the French decimal comma", () => {
    expect(parseSetDraft(draft({ weight: "42,5", reps: "10" }), strength)).toEqual({ ok: true, weightKg: 42.5, reps: 10, durationSeconds: null });
  });

  it("keeps empty fields as missing (null), not zero", () => {
    expect(parseSetDraft(draft({ reps: "12" }), strength)).toEqual({ ok: true, weightKg: null, reps: 12, durationSeconds: null });
  });

  it.each([
    [{ weight: "abc" }, "weight"],
    [{ weight: "-5" }, "weight"],
    [{ weight: "2000" }, "weight"],
    [{ reps: "8.5" }, "reps"],
    [{ reps: "-1" }, "reps"],
  ])("rejects %j", (v, field) => {
    expect(parseSetDraft(draft(v), strength)).toEqual({ ok: false, field });
  });

  it("reads holds in seconds and whole sections in minutes", () => {
    expect(parseSetDraft(draft({ duration: "45" }), hold)).toMatchObject({ durationSeconds: 45 });
    expect(parseSetDraft(draft({ duration: "20" }), swim)).toMatchObject({ durationSeconds: 1200 });
    expect(parseSetDraft(draft({ duration: "12,5" }), swim)).toMatchObject({ durationSeconds: 750 });
    expect(parseSetDraft(draft({ duration: "x" }), hold)).toEqual({ ok: false, field: "duration" });
  });
});

describe("display helpers", () => {
  it("round-trips a saved set into the form", () => {
    expect(draftFromLog(log({ weightKg: 42.5, reps: 9 }), strength)).toMatchObject({ weight: "42,5", reps: "9", completed: true });
    expect(draftFromLog(log({ durationSeconds: 1200 }), swim)).toMatchObject({ duration: "20" });
  });

  it("formats the previous column", () => {
    expect(formatLogged(log({ weightKg: 40, reps: 10 }), strength)).toBe("40 × 10");
    expect(formatLogged(log({ reps: 15 }), strength)).toBe("× 15");
    expect(formatLogged(log({ durationSeconds: 45 }), hold)).toBe("45 s");
    expect(formatLogged(undefined, strength)).toBe("—");
    expect(describePrevious([log({ weightKg: 40, reps: 10 }), log({ setNumber: 2, weightKg: 42.5, reps: 8 })], strength)).toBe("40 × 10 · 42,5 × 8");
  });

  it("formats the clock", () => {
    expect([0, 59, 61, 754, 3725].map(formatClock)).toEqual(["0:00", "0:59", "1:01", "12:34", "1:02:05"]);
  });
});
