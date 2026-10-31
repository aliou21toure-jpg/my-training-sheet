"use server";

/**
 * Thin wrappers: check the session, call the workout logic, translate
 * errors into messages. No business rule lives here.
 */
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { todayWeekday } from "@/features/settings/owner-settings";
import {
  WorkoutError,
  abandonSession,
  finishSession,
  logSet,
  pauseSession,
  removeSet,
  resumeSession,
  saveNotes,
  startWorkout,
} from "@/features/workouts/session";
import type { LoggedSet } from "@/features/workouts/summary";
import { requireOwner } from "@/lib/auth/current-owner";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireOwner();
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof WorkoutError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function startWorkoutAction(formData: FormData) {
  const owner = await requireOwner();
  const db = getDb();
  const option = Number(formData.get("option")) || undefined;
  try {
    await startWorkout(db, {
      weekday: await todayWeekday(db, owner.id, new Date()),
      option,
      idempotencyKey: String(formData.get("key") ?? ""),
    });
  } catch (error) {
    if (!(error instanceof WorkoutError)) throw error;
    redirect(`/workout?error=${error.code}`);
  }
  redirect("/workout");
}

export async function saveSetAction(input: unknown): Promise<ActionResult<LoggedSet>> {
  return run(() => logSet(getDb(), input));
}

export async function removeSetAction(input: { sessionId: string; snapshotKey: string; setNumber: number }): Promise<ActionResult> {
  return run(async () => {
    await removeSet(getDb(), input);
    return null;
  });
}

export async function pauseAction(sessionId: string): Promise<ActionResult> {
  return run(async () => {
    await pauseSession(getDb(), sessionId);
    return null;
  });
}

export async function resumeAction(sessionId: string): Promise<ActionResult> {
  return run(async () => {
    await resumeSession(getDb(), sessionId);
    return null;
  });
}

export async function notesAction(sessionId: string, notes: string): Promise<ActionResult> {
  return run(async () => {
    await saveNotes(getDb(), sessionId, String(notes));
    return null;
  });
}

export async function finishAction(sessionId: string, notes: string): Promise<ActionResult> {
  const result = await run(() => finishSession(getDb(), sessionId, String(notes)));
  if (!result.ok) return result;
  redirect(`/workout/${sessionId}/summary`);
}

export async function abandonAction(sessionId: string): Promise<ActionResult> {
  const result = await run(async () => {
    await abandonSession(getDb(), sessionId);
    return null;
  });
  if (!result.ok) return result;
  redirect("/");
}
