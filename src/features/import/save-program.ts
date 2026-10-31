/**
 * Writes a parsed program to the database, in ONE transaction:
 * either the whole new version is saved and activated, or nothing is.
 *
 * - The same file (same SHA-256) is never imported twice.
 * - Each import creates a new program version and makes it the active one;
 *   older versions stay, so workout history keeps its context.
 * - Exercise names are shared across days and versions ("Plank" exists once).
 */
import { desc, eq, sql } from "drizzle-orm";
import {
  exercises,
  importBatches,
  plannedExercises,
  trainingPrograms,
  workoutBlocks,
  workoutTemplates,
  workoutVariants,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { ImportIssue, ProgramDraft } from "./types";

export interface SaveProgramInput {
  program: ProgramDraft;
  issues: ImportIssue[];
  fileName: string;
  fileSize: number;
  fileSha256: string;
}

export type SaveProgramResult =
  | { ok: true; programId: string; version: number; exerciseCount: number }
  | { ok: false; reason: "duplicate"; version: number | null };

function isUniqueViolation(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

async function versionOfFile(db: Db, fileSha256: string): Promise<number | null> {
  const [row] = await db
    .select({ version: trainingPrograms.version })
    .from(importBatches)
    .leftJoin(trainingPrograms, eq(trainingPrograms.importBatchId, importBatches.id))
    .where(eq(importBatches.fileSha256, fileSha256))
    .limit(1);
  return row ? (row.version ?? null) : null;
}

export async function saveProgramDraft(db: Db, input: SaveProgramInput): Promise<SaveProgramResult> {
  const existing = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(eq(importBatches.fileSha256, input.fileSha256))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, reason: "duplicate", version: await versionOfFile(db, input.fileSha256) };
  }

  try {
    return await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatches)
        .values({
          fileName: input.fileName,
          fileSha256: input.fileSha256,
          fileSize: input.fileSize,
          status: "imported",
          sheetNames: input.program.days.flatMap((d) => (d.sheetName ? [d.sheetName] : [])),
          report: input.issues,
          importedAt: sql`now()`,
        })
        .returning({ id: importBatches.id });

      const [latest] = await tx
        .select({ version: trainingPrograms.version })
        .from(trainingPrograms)
        .orderBy(desc(trainingPrograms.version))
        .limit(1);
      const version = (latest?.version ?? 0) + 1;

      // Only one active program: switch the old one off first.
      await tx.update(trainingPrograms).set({ isActive: false }).where(eq(trainingPrograms.isActive, true));

      const [program] = await tx
        .insert(trainingPrograms)
        .values({
          importBatchId: batch!.id,
          version,
          title: input.program.title,
          summary: input.program.summary,
          isActive: true,
          reference: {
            sessionParts: input.program.sessionParts,
            rules: input.program.rules,
            notes: input.program.referenceNotes,
          },
        })
        .returning({ id: trainingPrograms.id });

      // Shared exercise catalogue, matched case-insensitively.
      const exerciseIds = new Map<string, string>();
      const exerciseId = async (name: string): Promise<string> => {
        const key = name.trim().toLowerCase();
        const known = exerciseIds.get(key);
        if (known) return known;
        const [found] = await tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(sql`lower(${exercises.name}) = ${key}`)
          .limit(1);
        const id = found?.id ?? (await tx.insert(exercises).values({ name: name.trim() }).returning({ id: exercises.id }))[0]!.id;
        exerciseIds.set(key, id);
        return id;
      };

      let exerciseCount = 0;
      for (const day of input.program.days) {
        const [template] = await tx
          .insert(workoutTemplates)
          .values({
            programId: program!.id,
            weekday: day.weekday,
            kind: day.kind,
            title: day.title,
            focus: day.focus,
            durationText: day.durationText,
            stepsTarget: day.stepsTarget,
            notes: day.notes,
          })
          .returning({ id: workoutTemplates.id });

        for (const variant of day.variants) {
          const [v] = await tx
            .insert(workoutVariants)
            .values({ templateId: template!.id, number: variant.number, label: variant.label })
            .returning({ id: workoutVariants.id });

          for (const block of variant.blocks) {
            const [b] = await tx
              .insert(workoutBlocks)
              .values({
                variantId: v!.id,
                position: block.position,
                kind: block.kind,
                name: block.name,
                rawTitle: block.rawTitle,
                durationText: block.durationText,
                durationMinutes: block.durationMinutes,
                rounds: block.rounds,
                restBetweenRoundsSeconds: block.restBetweenRoundsSeconds,
                optional: block.optional,
                selection: block.selection,
                instructions: block.instructions,
              })
              .returning({ id: workoutBlocks.id });

            for (const ex of block.exercises) {
              const p = ex.prescription;
              const t = p.target;
              await tx.insert(plannedExercises).values({
                blockId: b!.id,
                exerciseId: await exerciseId(ex.name),
                position: ex.position,
                rawName: ex.rawName,
                note: ex.note,
                alternatives: ex.alternatives,
                components: ex.components,
                sets: p.sets,
                targetType: t?.type ?? null,
                repsMin: t?.type === "reps" ? t.min : null,
                repsMax: t?.type === "reps" ? t.max : null,
                durationSeconds: t?.type === "duration" ? t.seconds : null,
                toFailure: p.toFailure,
                perSide: p.perSide,
                appliesToEachExercise: p.appliesToEachExercise,
                restSeconds: ex.rest.seconds,
                sourceText: p.sourceText,
                restSourceText: ex.rest.sourceText,
                needsReview: p.needsReview || ex.rest.needsReview,
                reviewReason: p.reviewReason ?? (ex.rest.needsReview ? "Temps de repos non reconnu." : null),
              });
              exerciseCount++;
            }
          }
        }
      }

      return { ok: true as const, programId: program!.id, version, exerciseCount };
    });
  } catch (error) {
    // Two saves of the same file at the same instant: the unique hash wins.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "duplicate", version: await versionOfFile(db, input.fileSha256) };
    }
    throw error;
  }
}
