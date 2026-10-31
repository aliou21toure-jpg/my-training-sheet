/**
 * Turns the rows of every sheet into a ProgramDraft.
 *
 * This file knows nothing about Excel files: it receives plain rows
 * ({ row, a, b, c }), so every rule here is unit-testable with arrays.
 *
 * Reading strategy: sheets are not grids. They are sequences of
 *   title row → optional header row → exercise rows / free-text rows.
 * A text-only row is either a section title or an instruction; anything
 * we cannot place is kept as text and reported, never dropped.
 */
import { parseCircuitText } from "./parse-circuit-text";
import { parseExerciseName } from "./parse-exercise-name";
import { parsePrescription, type ParsedPrescription } from "./parse-prescription";
import { parseRest } from "./parse-rest";
import { looksLikeSectionTitle, parseSectionTitle } from "./parse-section-title";
import type {
  BlockDraft,
  DayDraft,
  DayKind,
  ExerciseDraft,
  ImportIssue,
  ImportResult,
  ProgramDraft,
  RuleDraft,
  SessionPartDraft,
  SheetRow,
  VariantDraft,
} from "./types";

const WEEKDAYS: { weekday: number; sheetAliases: string[]; dayNames: string[] }[] = [
  { weekday: 1, sheetAliases: ["mon", "monday", "lundi"], dayNames: ["monday", "lundi"] },
  { weekday: 2, sheetAliases: ["tue", "tues", "tuesday", "mardi"], dayNames: ["tuesday", "mardi"] },
  { weekday: 3, sheetAliases: ["wed", "wednesday", "mercredi"], dayNames: ["wednesday", "mercredi"] },
  { weekday: 4, sheetAliases: ["thu", "thur", "thurs", "thursday", "jeudi"], dayNames: ["thursday", "jeudi"] },
  { weekday: 5, sheetAliases: ["fri", "friday", "vendredi"], dayNames: ["friday", "vendredi"] },
  { weekday: 6, sheetAliases: ["sat", "saturday", "samedi"], dayNames: ["saturday", "samedi"] },
  { weekday: 7, sheetAliases: ["sun", "sunday", "dimanche"], dayNames: ["sunday", "dimanche"] },
];
const OVERVIEW_ALIASES = ["week overview", "overview", "semaine"];
const RULES_ALIASES = ["rules & progression", "rules and progression", "rules", "règles"];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const isBlank = (s: string) => s.trim() === "";
const textOnly = (r: SheetRow) => !isBlank(r.a) && isBlank(r.b) && isBlank(r.c);
const isExerciseHeader = (r: SheetRow | undefined) =>
  !!r && /^exercise$/i.test(r.a.trim()) && /sets/i.test(r.b);

function findSheet(sheets: Map<string, SheetRow[]>, aliases: string[]) {
  for (const [name, rows] of sheets) {
    if (aliases.includes(norm(name))) return { name, rows };
  }
  return null;
}

/* ---------- Week overview ---------- */

interface OverviewDay {
  focus: string | null;
  durationText: string | null;
}

function parseOverview(rows: SheetRow[]) {
  const title = rows[0]?.a.trim() || null;
  const second = rows[1];
  const summary = second && textOnly(second) ? second.a.trim() : null;
  const days = new Map<number, OverviewDay>();
  const sessionParts: SessionPartDraft[] = [];

  let mode: "none" | "days" | "parts" = "none";
  for (const r of rows) {
    if (/^day$/i.test(r.a.trim()) && /focus/i.test(r.b)) { mode = "days"; continue; }
    if (/^part$/i.test(r.a.trim()) && /details/i.test(r.b)) { mode = "parts"; continue; }

    if (mode === "days") {
      const day = WEEKDAYS.find((d) => d.dayNames.includes(norm(r.a)));
      if (!day) { mode = "none"; continue; }
      days.set(day.weekday, {
        focus: r.b.trim() || null,
        durationText: r.c.trim() && r.c.trim() !== "-" ? r.c.trim() : null,
      });
    } else if (mode === "parts") {
      if (isBlank(r.b)) { mode = "none"; continue; }
      sessionParts.push({ name: r.a.trim(), details: r.b.trim(), durationText: r.c.trim() || null });
    }
  }
  return { title, summary, days, sessionParts };
}

/* ---------- Rules ---------- */

function parseRules(rows: SheetRow[]) {
  const rules: RuleDraft[] = [];
  const referenceNotes: string[] = [];
  rows.forEach((r, i) => {
    if (i === 0) return; // sheet title
    if (r.a.trim() === "#") return; // header
    if (!isBlank(r.b)) {
      const n = Number(r.a.trim());
      rules.push({ number: Number.isFinite(n) && r.a.trim() !== "" ? n : null, title: r.b.trim(), details: r.c.trim() });
    } else if (!isBlank(r.a)) {
      referenceNotes.push(r.a.trim());
    }
  });
  return { rules, referenceNotes };
}

/* ---------- Day sheets ---------- */

function newBlock(rawTitle: string, position: number, dayIsRecovery: boolean): BlockDraft {
  const t = parseSectionTitle(rawTitle, dayIsRecovery);
  const instructions: string[] = [];
  // Keep the detail when it says more than a bare duration ("Do 2 rounds of this…").
  if (t.detail && !/^\d+(\s*-\s*\d+)?\s*min$/i.test(t.detail)) instructions.push(t.detail);
  return {
    position,
    rawTitle: rawTitle.trim(),
    name: t.name,
    kind: t.kind,
    durationText: t.durationText,
    durationMinutes: t.durationMinutes,
    rounds: t.rounds,
    restBetweenRoundsSeconds: t.restBetweenRoundsSeconds,
    optional: false,
    selection: "all",
    instructions,
    exercises: [],
  };
}

function exerciseFromRow(r: SheetRow, position: number): ExerciseDraft {
  const n = parseExerciseName(r.a);
  return {
    position,
    rawName: r.a,
    ...n,
    prescription: parsePrescription(r.b),
    rest: parseRest(r.c),
    sourceRow: r.row,
  };
}

function prescriptionFromCircuitItem(sourceText: string, reps: number | null, seconds: number | null): ParsedPrescription {
  return {
    sourceText,
    sets: null, // rounds belong to the block
    target: seconds !== null ? { type: "duration", seconds } : reps !== null ? { type: "reps", min: reps, max: reps } : null,
    toFailure: false,
    perSide: false,
    appliesToEachExercise: false,
    needsReview: seconds === null && reps === null,
    reviewReason: seconds === null && reps === null ? "Quantité non reconnue" : null,
  };
}

const SWIM_EXTRA = /\+\s*(swim(?:ming)?)\.?\s*$/i;

/** Applies what the instruction text says to the block (optional, choice, prose circuits, extras). */
function finishBlock(block: BlockDraft, variant: VariantDraft, sheet: string, issues: ImportIssue[]) {
  const text = block.instructions.join(" ");

  if (/if you have time|only if|optional/i.test(text)) block.optional = true;
  if (/as many as you wish/i.test(text)) block.selection = "pickAny";
  else if (/pick one\b/i.test(text)) block.selection = "pickOne";

  if (block.exercises.length === 0) {
    const circuitLine = block.instructions.find((l) => /^circuit\b/i.test(l.trim()));
    const parsed = circuitLine ? parseCircuitText(circuitLine) : null;
    if (parsed) {
      block.rounds ??= parsed.rounds;
      block.restBetweenRoundsSeconds ??= parsed.restBetweenRoundsSeconds;
      block.exercises = parsed.items.map((item, i) => {
        const n = parseExerciseName(item.name);
        return {
          position: i + 1,
          rawName: item.name,
          ...n,
          prescription: prescriptionFromCircuitItem(item.sourceText, item.reps, item.durationSeconds),
          rest: { sourceText: "", seconds: null, needsReview: false },
          sourceRow: null,
        };
      });
    } else if (circuitLine) {
      issues.push({
        level: "review",
        sheet,
        row: null,
        message: `Circuit « ${block.name} » écrit en texte libre : exercices non découpés.`,
        sourceText: circuitLine,
      });
    }
  }

  // "+ Swim" at the end of a block: an extra activity, done in addition.
  const swimLine = block.instructions.find((l) => SWIM_EXTRA.test(l));
  if (swimLine && block.kind !== "swim") {
    const swim: BlockDraft = {
      ...newBlock("Swim", block.position + 1, false),
      kind: "swim",
      instructions: [`Ajouté après « ${block.name} » (texte d'origine : « + Swim »).`],
    };
    const index = variant.blocks.indexOf(block);
    variant.blocks.splice(index + 1, 0, swim);
    issues.push({
      level: "info",
      sheet,
      row: null,
      message: `Natation ajoutée après « ${block.name} » : durée non précisée dans le fichier.`,
      sourceText: swimLine,
    });
  }
}

function parseDaySheet(
  sheet: string,
  rows: SheetRow[],
  dayIsRecovery: boolean,
  issues: ImportIssue[],
) {
  const title = rows[0]?.a.trim() || null;
  const notes: string[] = [];
  const variants: VariantDraft[] = [];
  let variant: VariantDraft | null = null;
  let block: BlockDraft | null = null;
  let pending: string[] = [];

  const ensureVariant = () => {
    if (!variant) {
      variant = { number: 1, label: "Séance", blocks: [] };
      variants.push(variant);
    }
    return variant;
  };
  const flushPending = () => {
    if (pending.length === 0) return;
    if (block) block.instructions.push(...pending);
    else notes.push(...pending);
    pending = [];
  };

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (isExerciseHeader(r)) continue;

    if (textOnly(r)) {
      if (looksLikeSectionTitle(r.a, isExerciseHeader(rows[i + 1]))) {
        const t = parseSectionTitle(r.a, dayIsRecovery);
        let target: VariantDraft;
        if (t.variantNumber !== null) {
          target = { number: t.variantNumber, label: t.name, blocks: [] };
          variants.push(target);
          variant = target;
        } else {
          target = ensureVariant();
        }
        block = newBlock(r.a, target.blocks.length + 1, dayIsRecovery);
        block.instructions.push(...pending);
        pending = [];
        target.blocks.push(block);
      } else if (!block) {
        // Before any section: a note about the whole day.
        notes.push(r.a.trim());
      } else if (block.exercises.length === 0) {
        // Right under a section title with no table: the section's own text
        // (finisher, recovery plan, prose circuit, HIIT).
        flushPending();
        block.instructions.push(r.a.trim());
      } else {
        // After a table: may introduce the NEXT section ("Abs if you have time…"),
        // so it waits to see what comes next.
        pending.push(r.a.trim());
      }
      continue;
    }

    // A row with a prescription and/or a rest value.
    flushPending();
    if (!block) {
      const v = ensureVariant();
      block = newBlock("Exercises", v.blocks.length + 1, dayIsRecovery);
      v.blocks.push(block);
      issues.push({ level: "review", sheet, row: r.row, message: "Exercice trouvé avant tout titre de section.", sourceText: r.a });
    }

    if (/^rest between rounds$/i.test(r.a.trim())) {
      block.restBetweenRoundsSeconds = parseRest(r.c).seconds;
      continue;
    }
    if (isBlank(r.a)) {
      issues.push({ level: "review", sheet, row: r.row, message: "Ligne sans nom d'exercice.", sourceText: `${r.b} | ${r.c}` });
      continue;
    }

    const ex = exerciseFromRow(r, block.exercises.length + 1);
    block.exercises.push(ex);
    if (ex.prescription.needsReview) {
      issues.push({ level: "review", sheet, row: r.row, message: ex.prescription.reviewReason ?? "Prescription à vérifier.", sourceText: r.b });
    }
    if (ex.rest.needsReview) {
      issues.push({ level: "review", sheet, row: r.row, message: "Temps de repos non reconnu.", sourceText: r.c });
    }
  }
  flushPending();

  for (const v of variants) {
    for (const b of [...v.blocks]) finishBlock(b, v, sheet, issues);
    v.blocks.forEach((b, i) => (b.position = i + 1));
  }

  return { title, notes, variants };
}

function findStepsTarget(lines: string[]): number | null {
  for (const line of lines) {
    const k = /(\d+(?:[.,]\d+)?)\s*k\s*steps/i.exec(line);
    if (k) return Math.round(Number(k[1]!.replace(",", ".")) * 1000);
    const plain = /(\d{1,3}(?:[ ,.]\d{3})+|\d{4,})\s*steps/i.exec(line);
    if (plain) return Number(plain[1]!.replace(/[ ,.]/g, ""));
  }
  return null;
}

/* ---------- Program ---------- */

export function parseProgram(sheets: Map<string, SheetRow[]>): ImportResult {
  if (sheets.size === 0) {
    return { ok: false, error: { code: "empty", message: "Le classeur ne contient aucune feuille." } };
  }

  const overviewSheet = findSheet(sheets, OVERVIEW_ALIASES);
  const missing: string[] = [];
  if (!overviewSheet) missing.push("Week Overview");
  for (const d of WEEKDAYS.slice(0, 6)) {
    if (!findSheet(sheets, d.sheetAliases)) missing.push(d.sheetAliases[0]!.replace(/^./, (c) => c.toUpperCase()));
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: { code: "missing_sheets", message: `Feuilles introuvables : ${missing.join(", ")}.` },
    };
  }

  const issues: ImportIssue[] = [];
  const overview = parseOverview(overviewSheet!.rows);

  const days: DayDraft[] = WEEKDAYS.map((d) => {
    const ov = overview.days.get(d.weekday) ?? { focus: null, durationText: null };
    const sheet = findSheet(sheets, d.sheetAliases);
    const recoveryHint = /recovery|récup/i.test(ov.focus ?? "");

    if (!sheet || sheet.rows.length === 0) {
      return {
        weekday: d.weekday,
        sheetName: sheet?.name ?? null,
        title: null,
        focus: ov.focus,
        durationText: ov.durationText,
        kind: "rest" as DayKind,
        stepsTarget: null,
        notes: [],
        variants: [],
      };
    }

    const parsed = parseDaySheet(sheet.name, sheet.rows, recoveryHint, issues);
    const kind: DayKind =
      parsed.variants.length > 1 ? "choice" : recoveryHint ? "recovery" : parsed.variants.length === 0 ? "rest" : "strength";

    const allText = [...parsed.notes, ...parsed.variants.flatMap((v) => v.blocks.flatMap((b) => b.instructions))];

    // Keep the overview duration as written; only *report* a mismatch.
    const overviewMinutes = /^(\d+)\s*min$/i.exec(ov.durationText ?? "");
    const main = parsed.variants[0];
    if (kind === "strength" && overviewMinutes && main) {
      const required = main.blocks.filter((b) => !b.optional && b.durationMinutes !== null);
      const sum = required.reduce((t, b) => t + (b.durationMinutes ?? 0), 0);
      if (required.length > 0 && sum !== Number(overviewMinutes[1])) {
        issues.push({
          level: "info",
          sheet: sheet.name,
          row: null,
          message: `Durée : ${ov.durationText} dans l'aperçu, ${required.map((b) => `${b.durationMinutes} min (${b.name})`).join(" + ")} = ${sum} min dans la feuille. Les deux sont conservées.`,
          sourceText: ov.durationText,
        });
      }
    }

    return {
      weekday: d.weekday,
      sheetName: sheet.name,
      title: parsed.title,
      focus: ov.focus,
      durationText: ov.durationText,
      kind,
      stepsTarget: findStepsTarget(allText),
      notes: parsed.notes,
      variants: parsed.variants,
    };
  });

  const rulesSheet = findSheet(sheets, RULES_ALIASES);
  const { rules, referenceNotes } = rulesSheet ? parseRules(rulesSheet.rows) : { rules: [], referenceNotes: [] };
  if (!rulesSheet) {
    issues.push({ level: "info", sheet: "Rules & Progression", row: null, message: "Feuille des règles absente.", sourceText: null });
  }

  const program: ProgramDraft = {
    title: overview.title,
    summary: overview.summary,
    days,
    sessionParts: overview.sessionParts,
    rules,
    referenceNotes,
  };
  return { ok: true, program, issues };
}
