/**
 * Program editor, server side.
 *
 * The editor works on a ProgramDraft (the same shape the Excel import
 * produces). Saving validates it strictly and stores it as a NEW version:
 * past workouts keep their own snapshot, so history never changes.
 */
import { z } from "zod";
import type { Db } from "@/db/types";
import { saveProgramDraft } from "@/features/import/save-program";
import type { ProgramDraft, RuleDraft, SessionPartDraft } from "@/features/import/types";
import type { ActiveProgram } from "./load-program";

/* ---------- loaded program → editable draft ---------- */

export function programToDraft(program: ActiveProgram): ProgramDraft {
  const ref = program.reference as { sessionParts?: SessionPartDraft[]; rules?: RuleDraft[]; notes?: string[] };
  return {
    title: program.title,
    summary: program.summary,
    sessionParts: ref.sessionParts ?? [],
    rules: ref.rules ?? [],
    referenceNotes: ref.notes ?? [],
    days: Array.from({ length: 7 }, (_, i) => {
      const day = program.days.find((d) => d.weekday === i + 1);
      if (!day) {
        return { weekday: i + 1, sheetName: null, title: null, focus: "Repos", durationText: null, kind: "rest" as const, stepsTarget: null, notes: [], variants: [] };
      }
      return {
        weekday: day.weekday,
        sheetName: null,
        title: day.title,
        focus: day.focus,
        durationText: day.durationText,
        kind: day.kind,
        stepsTarget: day.stepsTarget,
        notes: day.notes,
        variants: day.variants.map((v) => ({
          number: v.number,
          label: v.label,
          blocks: v.blocks.map((b) => ({
            position: b.position,
            rawTitle: b.rawTitle,
            name: b.name,
            kind: b.kind,
            durationText: b.durationText,
            durationMinutes: b.durationMinutes,
            rounds: b.rounds,
            restBetweenRoundsSeconds: b.restBetweenRoundsSeconds,
            optional: b.optional,
            selection: b.selection,
            instructions: b.instructions,
            exercises: b.exercises.map((e, i) => ({
              exerciseId: e.exerciseId,
              position: i + 1,
              rawName: e.rawName,
              name: e.name,
              note: e.note,
              alternatives: e.alternatives,
              components: e.components,
              prescription: e.prescription,
              rest: { sourceText: e.restSourceText, seconds: e.restSeconds, needsReview: false },
              sourceRow: null,
            })),
          })),
        })),
      };
    }),
  };
}

/* ---------- strict validation of what the browser sends ---------- */

const text = (max: number) => z.string().max(max);
const optText = (max: number) => z.string().max(max).nullable();
const smallInt = (min: number, max: number) => z.number().int().min(min).max(max);

const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reps"), min: smallInt(0, 999), max: smallInt(0, 999) }).refine((t) => t.min <= t.max, "Fourchette inversée."),
  z.object({ type: z.literal("maxReps") }),
  z.object({ type: z.literal("duration"), seconds: smallInt(1, 6 * 3600) }),
]);

const exerciseSchema = z.object({
  exerciseId: z.string().uuid().optional(),
  position: smallInt(1, 60),
  rawName: text(300),
  name: text(120).trim().min(1, "Un exercice n’a pas de nom."),
  note: optText(300),
  alternatives: z.array(text(120)).max(6),
  components: z.array(text(120)).max(6),
  prescription: z.object({
    sourceText: text(300),
    sets: smallInt(1, 20).nullable(),
    target: targetSchema.nullable(),
    toFailure: z.boolean(),
    perSide: z.boolean(),
    appliesToEachExercise: z.boolean(),
    needsReview: z.boolean(),
    reviewReason: optText(200),
  }),
  rest: z.object({ sourceText: text(100), seconds: smallInt(0, 3600).nullable(), needsReview: z.boolean() }),
  sourceRow: z.number().int().nullable(),
});

const blockSchema = z.object({
  position: smallInt(1, 30),
  rawTitle: text(300),
  name: text(80).trim().min(1),
  kind: z.enum(["strength", "abs", "core", "finisher", "conditioning", "circuit", "hiit", "swim", "recovery", "other"]),
  durationText: optText(40),
  durationMinutes: smallInt(1, 600).nullable(),
  rounds: smallInt(1, 50).nullable(),
  restBetweenRoundsSeconds: smallInt(0, 3600).nullable(),
  optional: z.boolean(),
  selection: z.enum(["all", "pickOne", "pickAny"]),
  instructions: z.array(text(1000)).max(20),
  exercises: z.array(exerciseSchema).max(40),
});

const daySchema = z.object({
  weekday: smallInt(1, 7),
  sheetName: optText(60),
  title: optText(200),
  focus: optText(200),
  durationText: optText(40),
  kind: z.enum(["strength", "recovery", "rest", "choice"]),
  stepsTarget: smallInt(0, 100_000).nullable(),
  notes: z.array(text(1000)).max(20),
  variants: z
    .array(z.object({ number: smallInt(1, 9), label: text(60).trim().min(1), blocks: z.array(blockSchema).max(15) }))
    .max(5),
});

export const programDraftSchema = z.object({
  title: optText(200),
  summary: optText(500),
  sessionParts: z.array(z.object({ name: text(80), details: text(2000), durationText: optText(40) })).max(10),
  rules: z.array(z.object({ number: z.number().int().nullable(), title: text(200), details: text(2000) })).max(30),
  referenceNotes: z.array(text(2000)).max(30),
  days: z
    .array(daySchema)
    .length(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === 7, "Chaque jour doit apparaître une fois."),
});

/** Makes the draft consistent before saving: positions, day kinds, review flags. */
export function normalizeDraft(draft: ProgramDraft): ProgramDraft {
  return {
    ...draft,
    days: draft.days.map((day) => {
      const variants = day.variants.map((v, vi) => ({
        ...v,
        number: vi + 1,
        blocks: v.blocks.map((b, bi) => ({
          ...b,
          position: bi + 1,
          exercises: b.exercises.map((e, ei) => ({ ...e, position: ei + 1, name: e.name.trim() })),
        })),
      }));
      const hasContent = variants.some((v) => v.blocks.length > 0);
      const kind = !hasContent ? (day.kind === "recovery" ? "recovery" : "rest") : variants.length > 1 ? "choice" : day.kind === "choice" || day.kind === "rest" ? "strength" : day.kind;
      return { ...day, kind, variants: hasContent || day.kind === "recovery" ? variants : [] };
    }),
  };
}

export type SaveEditResult = { ok: true; version: number } | { ok: false; message: string };

export async function saveEditedProgram(db: Db, input: unknown): Promise<SaveEditResult> {
  const parsed = programDraftSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message && !issue.message.startsWith("Invalid") ? issue.message : "Programme invalide : vérifie les champs en rouge." };
  }
  const result = await saveProgramDraft(db, { source: "edit", program: normalizeDraft(parsed.data as ProgramDraft), issues: [] });
  if (!result.ok) return { ok: false, message: "Enregistrement impossible." };
  return { ok: true, version: result.version };
}
