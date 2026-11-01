/**
 * Loads the active program as a tree (days → options → blocks → exercises),
 * in 5 queries whatever its size.
 */
import { asc, eq, inArray } from "drizzle-orm";
import {
  exercises,
  plannedExercises,
  trainingPrograms,
  workoutBlocks,
  workoutTemplates,
  workoutVariants,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { ParsedPrescription } from "@/features/import/parse-prescription";
import type { BlockKind, DayKind, Selection } from "@/features/import/types";

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  name: string;
  rawName: string;
  components: string[];
  restSourceText: string;
  note: string | null;
  alternatives: string[];
  prescription: ParsedPrescription;
  restSeconds: number | null;
  needsReview: boolean;
}

export interface PlannedBlock {
  id: string;
  position: number;
  kind: BlockKind;
  name: string;
  rawTitle: string;
  durationText: string | null;
  durationMinutes: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  optional: boolean;
  selection: Selection;
  instructions: string[];
  exercises: PlannedExercise[];
}

export interface PlannedVariant {
  id: string;
  number: number;
  label: string;
  blocks: PlannedBlock[];
}

export interface PlannedDay {
  id: string;
  weekday: number;
  kind: DayKind;
  title: string | null;
  focus: string | null;
  durationText: string | null;
  stepsTarget: number | null;
  notes: string[];
  variants: PlannedVariant[];
}

export interface ActiveProgram {
  id: string;
  version: number;
  title: string | null;
  summary: string | null;
  /** Warm-up / cool-down, rules and notes, as imported. */
  reference: Record<string, unknown>;
  days: PlannedDay[];
}

type PlannedRow = typeof plannedExercises.$inferSelect;

/** Rebuilds the parser's prescription shape from stored columns, so one formatter serves both. */
export function prescriptionFromRow(row: PlannedRow): ParsedPrescription {
  const target =
    row.targetType === "reps" && row.repsMin !== null && row.repsMax !== null
      ? { type: "reps" as const, min: row.repsMin, max: row.repsMax }
      : row.targetType === "duration" && row.durationSeconds !== null
        ? { type: "duration" as const, seconds: row.durationSeconds }
        : row.targetType === "maxReps"
          ? { type: "maxReps" as const }
          : null;
  return {
    sourceText: row.sourceText,
    sets: row.sets,
    target,
    toFailure: row.toFailure,
    perSide: row.perSide,
    appliesToEachExercise: row.appliesToEachExercise,
    needsReview: row.needsReview,
    reviewReason: row.reviewReason,
  };
}

export async function loadActiveProgram(db: Db): Promise<ActiveProgram | null> {
  const [program] = await db.select().from(trainingPrograms).where(eq(trainingPrograms.isActive, true)).limit(1);
  if (!program) return null;

  const templates = await db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.programId, program.id))
    .orderBy(asc(workoutTemplates.weekday));
  const templateIds = templates.map((t) => t.id);

  const variants = templateIds.length
    ? await db.select().from(workoutVariants).where(inArray(workoutVariants.templateId, templateIds)).orderBy(asc(workoutVariants.number))
    : [];
  const variantIds = variants.map((v) => v.id);

  const blocks = variantIds.length
    ? await db.select().from(workoutBlocks).where(inArray(workoutBlocks.variantId, variantIds)).orderBy(asc(workoutBlocks.position))
    : [];
  const blockIds = blocks.map((b) => b.id);

  const planned = blockIds.length
    ? await db
        .select({ row: plannedExercises, name: exercises.name })
        .from(plannedExercises)
        .innerJoin(exercises, eq(exercises.id, plannedExercises.exerciseId))
        .where(inArray(plannedExercises.blockId, blockIds))
        .orderBy(asc(plannedExercises.position))
    : [];

  const exercisesByBlock = new Map<string, PlannedExercise[]>();
  for (const { row, name } of planned) {
    const list = exercisesByBlock.get(row.blockId) ?? [];
    list.push({
      id: row.id,
      exerciseId: row.exerciseId,
      name,
      rawName: row.rawName,
      components: row.components,
      restSourceText: row.restSourceText,
      note: row.note,
      alternatives: row.alternatives,
      prescription: prescriptionFromRow(row),
      restSeconds: row.restSeconds,
      needsReview: row.needsReview,
    });
    exercisesByBlock.set(row.blockId, list);
  }

  const blocksByVariant = new Map<string, PlannedBlock[]>();
  for (const b of blocks) {
    const list = blocksByVariant.get(b.variantId) ?? [];
    list.push({
      id: b.id,
      position: b.position,
      kind: b.kind,
      name: b.name,
      rawTitle: b.rawTitle,
      durationText: b.durationText,
      durationMinutes: b.durationMinutes,
      rounds: b.rounds,
      restBetweenRoundsSeconds: b.restBetweenRoundsSeconds,
      optional: b.optional,
      selection: b.selection,
      instructions: b.instructions,
      exercises: exercisesByBlock.get(b.id) ?? [],
    });
    blocksByVariant.set(b.variantId, list);
  }

  const variantsByTemplate = new Map<string, PlannedVariant[]>();
  for (const v of variants) {
    const list = variantsByTemplate.get(v.templateId) ?? [];
    list.push({ id: v.id, number: v.number, label: v.label, blocks: blocksByVariant.get(v.id) ?? [] });
    variantsByTemplate.set(v.templateId, list);
  }

  return {
    id: program.id,
    version: program.version,
    title: program.title,
    summary: program.summary,
    reference: program.reference,
    days: templates.map((t) => ({
      id: t.id,
      weekday: t.weekday,
      kind: t.kind,
      title: t.title,
      focus: t.focus,
      durationText: t.durationText,
      stepsTarget: t.stepsTarget,
      notes: t.notes,
      variants: variantsByTemplate.get(t.id) ?? [],
    })),
  };
}
