/**
 * The training calendar = the weekly program + exceptions.
 *
 * By default a date gets the program day of its weekday (Monday → Monday's
 * workout). planned_sessions stores only exceptions for a given date: a
 * workout moved from another day, or the Saturday option chosen in advance.
 *
 * Exceptions point to a template; when a new program version is imported,
 * they are mapped to the new version by weekday and option number, so a
 * plan made last week still makes sense after an import.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { plannedSessions, workoutSessions, workoutTemplates, workoutVariants } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ActiveProgram, PlannedDay } from "@/features/program/load-program";
import { localDateInfo } from "@/lib/dates/local-date";

export interface ScheduleOverride {
  isoDate: string;
  /** Weekday of the program day placed on this date. */
  sourceWeekday: number;
  optionNumber: number | null;
  movedFrom: string | null;
}

export interface ScheduledDay {
  isoDate: string;
  weekday: number;
  day: PlannedDay | null;
  /** Saturday: the option chosen for this date, if any. */
  optionNumber: number | null;
  movedFrom: string | null;
}

/** ISO weekday (1 = Monday) of a calendar date, independent of time zones. */
export function weekdayOf(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export async function loadOverrides(db: Db, from: string, to: string): Promise<Map<string, ScheduleOverride>> {
  const rows = await db
    .select({
      date: plannedSessions.date,
      movedFrom: plannedSessions.movedFrom,
      weekday: workoutTemplates.weekday,
      optionNumber: workoutVariants.number,
    })
    .from(plannedSessions)
    .innerJoin(workoutTemplates, eq(workoutTemplates.id, plannedSessions.templateId))
    .leftJoin(workoutVariants, eq(workoutVariants.id, plannedSessions.variantId))
    .where(and(gte(plannedSessions.date, from), lte(plannedSessions.date, to)));
  return new Map(
    rows.map((r) => [r.date, { isoDate: r.date, sourceWeekday: r.weekday, optionNumber: r.optionNumber, movedFrom: r.movedFrom }]),
  );
}

export function resolveDay(program: ActiveProgram | null, isoDate: string, override?: ScheduleOverride): ScheduledDay {
  const weekday = weekdayOf(isoDate);
  const sourceWeekday = override?.sourceWeekday ?? weekday;
  const day = program?.days.find((d) => d.weekday === sourceWeekday) ?? null;
  const option = override?.optionNumber ?? null;
  return {
    isoDate,
    weekday,
    day,
    optionNumber: option !== null && day?.variants.some((v) => v.number === option) ? option : null,
    movedFrom: override?.movedFrom ?? null,
  };
}

export async function resolveRange(db: Db, program: ActiveProgram | null, dates: string[]): Promise<Map<string, ScheduledDay>> {
  if (dates.length === 0) return new Map();
  const sorted = [...dates].sort();
  const overrides = await loadOverrides(db, sorted[0]!, sorted.at(-1)!);
  return new Map(dates.map((d) => [d, resolveDay(program, d, overrides.get(d))]));
}

/* ---------- changes ---------- */

export type ScheduleErrorCode = "past" | "done" | "no_program" | "not_choice" | "unknown_option" | "same_day" | "too_far";

export class ScheduleError extends Error {
  constructor(
    public readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_DAYS_AHEAD = 62;

/** Dates on which a workout was completed (or is under way), in the owner's time zone. */
async function trainedDates(db: Db, dates: string[], timeZone: string): Promise<Set<string>> {
  const sorted = [...dates].sort();
  const from = new Date(`${sorted[0]}T00:00:00Z`).getTime() - 2 * 86_400_000;
  const to = new Date(`${sorted.at(-1)}T00:00:00Z`).getTime() + 2 * 86_400_000;
  const rows = await db
    .select({ startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .where(
      and(
        inArray(workoutSessions.status, ["completed", "in_progress", "paused"]),
        gte(workoutSessions.startedAt, new Date(from)),
        lte(workoutSessions.startedAt, new Date(to)),
      ),
    );
  return new Set(rows.map((r) => localDateInfo(r.startedAt, timeZone).isoDate).filter((d) => dates.includes(d)));
}

function assertEditable(isoDate: string, today: string) {
  if (isoDate < today) throw new ScheduleError("past", "Le passé ne se modifie pas.");
  const days = (new Date(`${isoDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000;
  if (days > MAX_DAYS_AHEAD) throw new ScheduleError("too_far", "Date trop éloignée.");
}

/** Writes the exception for a date, or removes it when the date is back to its default. */
async function writeOverride(db: Db, program: ActiveProgram, isoDate: string, sourceWeekday: number, optionNumber: number | null, movedFrom: string | null) {
  const isDefault = sourceWeekday === weekdayOf(isoDate) && optionNumber === null;
  if (isDefault) {
    await db.delete(plannedSessions).where(eq(plannedSessions.date, isoDate));
    return;
  }
  const day = program.days.find((d) => d.weekday === sourceWeekday);
  if (!day) throw new ScheduleError("no_program", "Jour absent du programme.");
  const variantId = optionNumber === null ? null : (day.variants.find((v) => v.number === optionNumber)?.id ?? null);
  await db
    .insert(plannedSessions)
    .values({ date: isoDate, templateId: day.id, variantId, movedFrom, status: "planned" })
    .onConflictDoUpdate({ target: plannedSessions.date, set: { templateId: day.id, variantId, movedFrom } });
}

/**
 * Exchanges the workouts of two dates (moving Thursday's pull day to Friday
 * puts Friday's workout on Thursday). Moving a workout onto a rest day
 * therefore makes the original day a rest day. Only today and later.
 */
export async function swapDays(db: Db, program: ActiveProgram | null, a: string, b: string, today: string, timeZone: string) {
  if (!program) throw new ScheduleError("no_program", "Aucun programme.");
  if (a === b) throw new ScheduleError("same_day", "Choisis un autre jour.");
  assertEditable(a, today);
  assertEditable(b, today);
  if ((await trainedDates(db, [a, b], timeZone)).size > 0) {
    throw new ScheduleError("done", "Un de ces jours a déjà une séance enregistrée.");
  }
  const days = await resolveRange(db, program, [a, b]);
  const dayA = days.get(a)!;
  const dayB = days.get(b)!;
  const source = (s: ScheduledDay) => s.day?.weekday ?? s.weekday;
  await db.transaction(async (tx) => {
    await writeOverride(tx as unknown as Db, program, a, source(dayB), dayB.optionNumber, dayB.movedFrom ?? b);
    await writeOverride(tx as unknown as Db, program, b, source(dayA), dayA.optionNumber, dayA.movedFrom ?? a);
  });
}

/** Chooses the option of a choice day (Saturday) for a given date. Null clears the choice. */
export async function chooseOption(db: Db, program: ActiveProgram | null, isoDate: string, optionNumber: number | null, today: string) {
  if (!program) throw new ScheduleError("no_program", "Aucun programme.");
  assertEditable(isoDate, today);
  const current = (await resolveRange(db, program, [isoDate])).get(isoDate)!;
  if (!current.day || current.day.kind !== "choice") throw new ScheduleError("not_choice", "Ce jour n’a pas d’options.");
  if (optionNumber !== null && !current.day.variants.some((v) => v.number === optionNumber)) {
    throw new ScheduleError("unknown_option", "Option inconnue.");
  }
  await writeOverride(db, program, isoDate, current.day.weekday, optionNumber, current.movedFrom);
}

/** Puts a date back to its default program day. */
export async function resetDay(db: Db, isoDate: string, today: string) {
  assertEditable(isoDate, today);
  await db.delete(plannedSessions).where(eq(plannedSessions.date, isoDate));
}
