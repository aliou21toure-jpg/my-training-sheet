"use server";

import { getDb } from "@/db/client";
import { parseIsoDate } from "@/features/calendar/get-calendar";
import { loadActiveProgram } from "@/features/program/load-program";
import { ScheduleError, chooseOption, swapDays } from "@/features/schedule/schedule";
import { getTimeZone, todayIsoDate } from "@/features/settings/owner-settings";
import { requireOwner } from "@/lib/auth/current-owner";

export type CalendarActionResult = { ok: true } | { ok: false; message: string };

async function run(fn: () => Promise<void>): Promise<CalendarActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof ScheduleError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function swapDaysAction(from: string, to: string): Promise<CalendarActionResult> {
  const owner = await requireOwner();
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return { ok: false, message: "Date invalide." };
  const db = getDb();
  return run(async () =>
    swapDays(db, await loadActiveProgram(db), a, b, await todayIsoDate(db, owner.id, new Date()), await getTimeZone(db, owner.id)),
  );
}

export async function chooseOptionAction(date: string, option: number | null): Promise<CalendarActionResult> {
  const owner = await requireOwner();
  const d = parseIsoDate(date);
  if (!d || (option !== null && (!Number.isInteger(option) || option < 1 || option > 20))) {
    return { ok: false, message: "Valeur invalide." };
  }
  const db = getDb();
  return run(async () => chooseOption(db, await loadActiveProgram(db), d, option, await todayIsoDate(db, owner.id, new Date())));
}
