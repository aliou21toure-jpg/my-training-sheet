/**
 * The frozen copy of a planned workout, stored in workout_sessions.plan_snapshot.
 *
 * Everything the workout screen and the history need is copied here, so
 * editing or replacing the program later never changes a past session.
 * Keys ("b2.e3" = block 2, exercise 3) identify an exercise inside the
 * snapshot; set_logs.snapshot_key points to them.
 */
import { formatPrescription } from "@/features/import/format";
import type { BlockKind, Selection } from "@/features/import/types";
import type { PlannedDay, PlannedVariant } from "@/features/program/load-program";

export const SNAPSHOT_VERSION = 1;

/** What the user types for each set. */
export type SetInput = "weightReps" | "duration";

export interface SnapshotExercise {
  key: string;
  exerciseId: string;
  name: string;
  note: string | null;
  alternatives: string[];
  /** "3 × 10–12 · échec", as planned. */
  plannedLabel: string;
  plannedSets: number;
  input: SetInput;
  /** Unit of the duration field: seconds for holds, minutes for whole sections (HIIT, swim). */
  durationUnit: "s" | "min";
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
  perSide: boolean;
  toFailure: boolean;
  restSeconds: number | null;
}

export interface SnapshotBlock {
  key: string;
  kind: BlockKind;
  name: string;
  optional: boolean;
  selection: Selection;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  durationText: string | null;
  instructions: string[];
  exercises: SnapshotExercise[];
}

export interface WorkoutSnapshot {
  version: typeof SNAPSHOT_VERSION;
  programVersion: number;
  weekday: number;
  title: string;
  variantNumber: number;
  variantLabel: string;
  durationText: string | null;
  blocks: SnapshotBlock[];
}

/**
 * @param sectionExerciseIds catalogue ids used for blocks that have no
 *   exercise rows (HIIT, swim…): the block itself becomes one timed entry.
 */
export function buildSnapshot(
  day: PlannedDay,
  variant: PlannedVariant,
  programVersion: number,
  sectionExerciseIds: Map<string, string>,
): WorkoutSnapshot {
  const blocks: SnapshotBlock[] = variant.blocks.map((block, bi) => {
    const blockKey = `b${bi + 1}`;
    let exercises: SnapshotExercise[] = block.exercises.map((e, ei) => {
      const p = e.prescription;
      const t = p.target;
      return {
        key: `${blockKey}.e${ei + 1}`,
        exerciseId: e.exerciseId,
        name: e.name,
        note: e.note,
        alternatives: e.alternatives,
        plannedLabel: formatPrescription(p),
        plannedSets: Math.max(1, p.sets ?? block.rounds ?? 1),
        input: t?.type === "duration" ? "duration" : "weightReps",
        durationUnit: "s",
        targetRepsMin: t?.type === "reps" ? t.min : null,
        targetRepsMax: t?.type === "reps" ? t.max : null,
        targetSeconds: t?.type === "duration" ? t.seconds : null,
        perSide: p.perSide,
        toFailure: p.toFailure,
        restSeconds: e.restSeconds ?? block.restBetweenRoundsSeconds,
      };
    });

    const sectionId = sectionExerciseIds.get(block.id);
    if (exercises.length === 0 && sectionId) {
      exercises = [
        {
          key: `${blockKey}.e1`,
          exerciseId: sectionId,
          name: block.name,
          note: null,
          alternatives: [],
          plannedLabel: block.durationText ?? (block.rounds ? `${block.rounds} tours` : "Section"),
          plannedSets: 1,
          input: "duration",
          durationUnit: "min",
          targetRepsMin: null,
          targetRepsMax: null,
          targetSeconds: block.durationMinutes ? block.durationMinutes * 60 : null,
          perSide: false,
          toFailure: false,
          restSeconds: null,
        },
      ];
    }

    return {
      key: blockKey,
      kind: block.kind,
      name: block.name,
      optional: block.optional,
      selection: block.selection,
      rounds: block.rounds,
      restBetweenRoundsSeconds: block.restBetweenRoundsSeconds,
      durationText: block.durationText,
      instructions: block.instructions,
      exercises,
    };
  });

  return {
    version: SNAPSHOT_VERSION,
    programVersion,
    weekday: day.weekday,
    // A choice day (Saturday) is named after the option picked, not the long overview text.
    title: day.kind === "choice" ? `Option ${variant.number} · ${variant.label}` : (day.focus ?? day.title ?? variant.label),
    variantNumber: variant.number,
    variantLabel: variant.label,
    durationText: day.durationText,
    blocks,
  };
}

export function findSnapshotExercise(snapshot: WorkoutSnapshot, key: string): SnapshotExercise | null {
  for (const block of snapshot.blocks) {
    const found = block.exercises.find((e) => e.key === key);
    if (found) return found;
  }
  return null;
}
