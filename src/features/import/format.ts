/**
 * Turns parsed values back into short French labels for the preview.
 * Pure functions, shared by every screen that shows a prescription.
 */
import type { ParsedPrescription } from "./parse-prescription";
import type { BlockDraft, BlockKind, DayKind, ImportIssue, ProgramDraft } from "./types";

export const WEEKDAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

export const weekdayLabel = (weekday: number) => WEEKDAY_LABELS[weekday - 1] ?? `Jour ${weekday}`;

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  strength: "Musculation",
  recovery: "Récupération",
  rest: "Repos",
  choice: "Au choix",
};

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  strength: "Force",
  abs: "Abdos",
  core: "Gainage",
  finisher: "Finisher",
  conditioning: "Conditionnement",
  circuit: "Circuit",
  hiit: "HIIT",
  swim: "Natation",
  recovery: "Récupération",
  other: "Section",
};

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m} min ${String(s).padStart(2, "0")}`;
}

/** "2 × 8–10 · échec", "3 × 30 s / côté", "2 × max", "12 reps". */
export function formatPrescription(p: ParsedPrescription): string {
  if (!p.target) return p.sourceText.trim() || "—";

  let target: string;
  switch (p.target.type) {
    case "reps":
      target = p.target.min === p.target.max ? `${p.target.min}` : `${p.target.min}–${p.target.max}`;
      if (p.sets === null) target += " reps";
      break;
    case "duration":
      target = formatSeconds(p.target.seconds);
      break;
    case "maxReps":
      target = "max";
      break;
  }

  let out = p.sets !== null ? `${p.sets} × ${target}` : target;
  if (p.perSide) out += " / côté";
  if (p.toFailure) out += " · échec";
  if (p.appliesToEachExercise) out += " · chacun";
  return out;
}

/** Small tags shown next to a block title. */
export function blockTags(block: BlockDraft): string[] {
  const tags: string[] = [];
  if (block.durationText) tags.push(block.durationText);
  if (block.rounds) tags.push(`${block.rounds} tours`);
  if (block.restBetweenRoundsSeconds) tags.push(`${formatSeconds(block.restBetweenRoundsSeconds)} entre les tours`);
  if (block.optional) tags.push("Optionnel");
  if (block.selection === "pickOne") tags.push("1 au choix");
  if (block.selection === "pickAny") tags.push("Au choix");
  return tags;
}

export interface ImportSummary {
  trainingDays: number;
  exercises: number;
  review: number;
  info: number;
}

export function summarizeImport(program: ProgramDraft, issues: ImportIssue[]): ImportSummary {
  return {
    trainingDays: program.days.filter((d) => d.kind !== "rest").length,
    exercises: program.days.reduce(
      (n, d) => n + d.variants.reduce((m, v) => m + v.blocks.reduce((k, b) => k + b.exercises.length, 0), 0),
      0,
    ),
    review: issues.filter((i) => i.level === "review" || i.level === "error").length,
    info: issues.filter((i) => i.level === "info").length,
  };
}
