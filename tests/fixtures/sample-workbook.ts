/**
 * SYNTHETIC workbook that mirrors the layout of a real training file
 * (8 sheets, title rows, header rows, prose sections, Saturday options).
 * No personal data: invented title, generic exercises, no body metrics.
 *
 * Built in memory with ExcelJS so no binary file lives in the repository.
 */
import ExcelJS from "exceljs";

type Cell = string | number | null;
export type SheetSpec = { rows: Cell[][]; merge?: string[] };

export async function buildWorkbook(sheets: Record<string, SheetSpec>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const [name, spec] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    spec.rows.forEach((cells, i) => {
      cells.forEach((value, j) => {
        if (value !== null) ws.getCell(i + 1, j + 1).value = value;
      });
    });
    for (const range of spec.merge ?? []) ws.mergeCells(range);
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

const header: Cell[] = ["Exercise", "Sets x Reps", "Rest"];

export const sampleSheets: Record<string, SheetSpec> = {
  "Week Overview": {
    merge: ["A1:C1", "A2:C2"],
    rows: [
      ["Sample Training Program"],
      ["Strength + conditioning | 5 training days"],
      [],
      ["The week at a glance"],
      ["Day", "Focus", "Duration"],
      ["Monday", "Lower body + abs", "60 min"],
      ["Tuesday", "Push day", "60 min"],
      ["Wednesday", "Active recovery (walk, stretch)", "30-40 min"],
      ["Thursday", "Pull day", "60 min"],
      ["Friday", "Shoulders and arms", "60 min"],
      ["Saturday", "Circuit or HIIT or conditioning", "60 min"],
      ["Sunday", "Full rest", "-"],
      [],
      ["Every session starts the same way"],
      ["Part", "Details", "Duration"],
      ["Warm-up", "5 min easy cardio, mobility drills.", "6 min"],
      ["Cool-down", "Stretch the muscles you trained, 30 s each.", "4 min"],
    ],
  },
  Mon: {
    merge: ["A1:C1"],
    rows: [
      ["Monday - Lower body + abs"],
      [],
      [],
      ["Strength - 60 min"],
      header,
      ["Squat (start light)", "2 x 8-10 (Failure)", "90 s"],
      ["Leg curl ", "3 x 12 (Failure)", "75 s"],
      ["Calf raise + Back extensions", "3 x 15 for each exercise", "45 s"],
      ["Abs if you have time (Pick one exercise from the below list)"],
      ["Abs "],
      header,
      ["Hanging or lying leg raise", "3 x 12", "1 min"],
      ["Cable crunch (or weighted crunch)", "3 x 15", "1 min"],
      ["Plank", "3 x 45 s", "1 min"],
      [],
      ["Finisher - 15 min"],
      ["Incline walk, brisk pace. --> Only if you're low on steps"],
    ],
  },
  Tue: {
    rows: [
      ["Tuesday - Push day"],
      [],
      [],
      ["Strength - 60 Min"],
      header,
      ["Bench press", "2 x (6-8) reps", "2 min"],
      ["Pec deck or cable fly", "3 x 12 (Failure)", "2min "],
      ["Pushups ", "2x max reps", "2min "],
      ["You can pick one ab exercise or do as many as you wish if you have time."],
      ["Abs "],
      header,
      ["Plank", "3 x 45 s", "1 min"],
    ],
  },
  Wed: {
    rows: [
      ["Wednesday - Active recovery"],
      [],
      [],
      ["Plan - 30-40 min"],
      ["30-40 min brisk walk plus 10 min of stretching. No weights."],
      ["Aim for 10K steps on that day."],
    ],
  },
  Thu: {
    rows: [
      ["Thursday - Pull"],
      [],
      [],
      ["Strength - 60 min "],
      header,
      ["Lat pull downs or assisted pull ups", "3 x 10-12 (Failure)", "2min "],
      ["Rear delt flies (Cable or Machine)", "2 x 10-12", "1min30"],
      [],
      ["Abs "],
      header,
      ["Side plank", "3 x 30 s / side", "1min"],
      ["Mystery move", "3 x heavy", "soon"],
    ],
  },
  Fri: {
    rows: [
      ["Friday - Shoulders and arms"],
      [],
      [],
      ["Strength - 35 min"],
      header,
      ["Shoulder press", "3 x 8-10 (Failure)", "2min "],
      ["Overhead tricep extensions ", "3x10-12 (Failure)", "2min"],
      [],
      ["Conditioning - 12 min"],
      ["Circuit, 4 rounds, 60 s rest between rounds: 12 kettlebell swings, 20 mountain climbers, 10 burpees, 30 s jump rope."],
    ],
  },
  Sat: {
    merge: ["A1:C1", "A2:C2"],
    rows: [
      ["Saturday - Options"],
      ["Pick option 1, 2 or 3."],
      [],
      ["1) Circuit - 35 min (4 rounds, minimal rest inside a round, 90 s between rounds)"],
      header,
      ["Goblet squat", "4 x 12", "-"],
      ["Step-ups on bench", "4 x 10 / leg", "-"],
      ["Rest between rounds", "-", "90 s"],
      [],
      ["Core - 10 min, 3 rounds"],
      header,
      ["Dead bug", "3 x 12 / side", "-"],
      [],
      ["2) HIIT -  Do 2 rounds of this if you want intense cardio)"],
      ["Bike: 30 s hard / 60 s easy, 8 rounds. + Swim."],
      [],
      ["3) Conditioning - 12 min"],
      ["Circuit, 4 rounds, 60 s rest between rounds: 12 kettlebell swings, 10 burpees, 30 s jumping jacks. + Swim"],
    ],
  },
  "Rules & Progression": {
    rows: [
      ["Rules"],
      [],
      [],
      ["#", "Rule", "Details"],
      [1, "Progressive overload", "Add a little every week: reps, load or a set."],
      [2, "Sleep and steps", "Sleep well and walk daily."],
      [],
      ["Check with a professional if anything hurts."],
    ],
  },
};

export const buildSampleWorkbook = () => buildWorkbook(sampleSheets);
