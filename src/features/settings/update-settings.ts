import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  importBatches,
  personalSettings,
  plannedExercises,
  plannedSessions,
  setLogs,
  trainingPrograms,
  workoutBlocks,
  workoutSessions,
  workoutTemplates,
  workoutVariants,
  exercises,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { isValidTimeZone } from "@/lib/dates/local-date";

export const settingsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  theme: z.enum(["system", "light", "dark"]),
  unit: z.enum(["kg", "lb"]),
  timezone: z.string().refine(isValidTimeZone, "Fuseau horaire inconnu."),
  reminderEnabled: z.boolean(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});
export type SettingsInput = z.input<typeof settingsSchema>;

export async function updateSettings(db: Db, ownerId: string, input: unknown) {
  const v = settingsSchema.parse(input);
  const values = {
    displayName: v.displayName,
    theme: v.theme,
    unit: v.unit,
    timezone: v.timezone,
    reminderEnabled: v.reminderEnabled,
    reminderTime: v.reminderEnabled ? (v.reminderTime ?? "18:00") : v.reminderTime,
    updatedAt: sql`now()`,
  };
  await db
    .insert(personalSettings)
    .values({ ownerId, ...values })
    .onConflictDoUpdate({ target: personalSettings.ownerId, set: values });
}

export const ERASE_CONFIRMATION = "EFFACER";

/**
 * "history": every workout, set and calendar change. The program stays.
 * "everything": history + every program version and import. The account and its settings stay.
 */
export async function eraseData(db: Db, scope: "history" | "everything", confirmation: string) {
  if (confirmation.trim().toUpperCase() !== ERASE_CONFIRMATION) {
    throw new Error("confirmation");
  }
  await db.transaction(async (tx) => {
    await tx.delete(setLogs);
    await tx.delete(workoutSessions);
    await tx.delete(plannedSessions);
    if (scope === "everything") {
      await tx.delete(plannedExercises);
      await tx.delete(workoutBlocks);
      await tx.delete(workoutVariants);
      await tx.delete(workoutTemplates);
      await tx.delete(trainingPrograms);
      await tx.delete(importBatches);
      await tx.delete(exercises);
    }
  });
}

