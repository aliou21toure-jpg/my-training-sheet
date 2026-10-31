import { describe, expect, it } from "vitest";
import { blockTags, formatPrescription, formatSeconds, weekdayLabel } from "@/features/import/format";
import { parsePrescription } from "@/features/import/parse-prescription";
import { MAX_WORKBOOK_BYTES } from "@/features/import/parse-workbook";
import type { BlockDraft } from "@/features/import/types";
import { validateUpload } from "@/features/import/validate-upload";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const file = (name: string, size: number, type = XLSX) => new File([new Uint8Array(size)], name, { type });

describe("validateUpload", () => {
  it("accepts a normal .xlsx", () => {
    expect(validateUpload(file("program.xlsx", 10_000)).ok).toBe(true);
  });

  it("accepts .xlsx sent without a MIME type", () => {
    expect(validateUpload(file("program.XLSX", 10_000, "")).ok).toBe(true);
  });

  it.each([
    [null, "Choisis un fichier Excel."],
    ["program.xlsx", "Choisis un fichier Excel."],
    [file("program.xlsx", 0), "Le fichier est vide."],
    [file("program.xlsx", MAX_WORKBOOK_BYTES + 1), "900 Ko"],
    [file("program.xls", 10), ".xlsx"],
    [file("program.csv", 10, "text/csv"), ".xlsx"],
    [file("program.xlsx", 10, "text/html"), "Type de fichier"],
  ])("rejects %#", (value, message) => {
    const r = validateUpload(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(message);
  });
});

describe("format", () => {
  it.each([
    ["2 x 8-10 (Failure)", "2 × 8–10 · échec"],
    ["3 x 12", "3 × 12"],
    ["3 x 30 s / side", "3 × 30 s / côté"],
    ["2x max reps", "2 × max"],
    ["3 x 15 for each exercise", "3 × 15 · chacun"],
    ["3 x heavy", "3 x heavy"],
  ])("formats %j as %j", (text, expected) => {
    expect(formatPrescription(parsePrescription(text))).toBe(expected);
  });

  it("formats seconds", () => {
    expect([45, 60, 90, 120].map(formatSeconds)).toEqual(["45 s", "1 min", "1 min 30", "2 min"]);
  });

  it("names weekdays in French", () => {
    expect([1, 6, 7].map(weekdayLabel)).toEqual(["Lundi", "Samedi", "Dimanche"]);
  });

  it("builds block tags from what was parsed only", () => {
    const block = {
      durationText: "12 min",
      rounds: 4,
      restBetweenRoundsSeconds: 60,
      optional: true,
      selection: "pickOne",
    } as BlockDraft;
    expect(blockTags(block)).toEqual(["12 min", "4 tours", "1 min entre les tours", "Optionnel", "1 au choix"]);
  });
});
