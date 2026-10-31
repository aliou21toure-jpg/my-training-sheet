/**
 * Everything the Today screen shows, computed on the server in one place:
 * today's plan, the week strip, the completed count and what comes next.
 *
 * Takes `now` and the time zone as inputs so tests can pin any moment
 * (midnight, daylight-saving change, Sunday → Monday).
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { personalSettings, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { BLOCK_KIND_LABELS } from "@/features/import/format";
import { loadActiveProgram, type PlannedDay } from "@/features/program/load-program";
import {
  DEFAULT_TIME_ZONE,
  addDays,
  dayOfMonth,
  formatLongDate,
  greetingFor,
  localDateInfo,
  weekDates,
} from "@/lib/dates/local-date";

export type WeekDayStatus = "done" | "today" | "planned" | "missed" | "recovery" | "rest" | "none";

export interface WeekDay {
  isoDate: string;
  weekday: number;
  dayOfMonth: number;
  status: WeekDayStatus;
  isToday: boolean;
}

export interface UpcomingDay {
  isoDate: string;
  weekday: number;
  dayOfMonth: number;
  kind: PlannedDay["kind"];
  title: string;
  subtitle: string;
}

export interface TodayView {
  isoDate: string;
  dateLabel: string;
  greeting: string;
  displayName: string | null;
  programVersion: number | null;
  today: PlannedDay | null;
  /** Already trained today (a completed session on this local date). */
  doneToday: boolean;
  activeSessionId: string | null;
  week: WeekDay[];
  completedThisWeek: number;
  plannedThisWeek: number;
  upcoming: UpcomingDay[];
}

const isTrainingDay = (day: PlannedDay | undefined) => day?.kind === "strength" || day?.kind === "choice";

/** One line describing a day, for the "À venir" list. */
export function describeDay(day: PlannedDay): { title: string; subtitle: string } {
  const title = day.focus ?? day.title ?? "Séance";
  switch (day.kind) {
    case "rest":
      return { title: "Repos complet", subtitle: "Aucune séance prévue" };
    case "recovery":
      return {
        title,
        subtitle: [day.durationText, day.stepsTarget ? `${day.stepsTarget.toLocaleString("fr-FR")} pas` : null]
          .filter(Boolean)
          .join(" · ") || "Récupération active",
      };
    case "choice":
      return { title, subtitle: `${day.variants.length} options au choix` };
    case "strength": {
      const main = day.variants[0];
      const required = main?.blocks.filter((b) => !b.optional) ?? [];
      const count = required.reduce((n, b) => n + b.exercises.length, 0);
      const optional = main?.blocks.filter((b) => b.optional).map((b) => BLOCK_KIND_LABELS[b.kind].toLowerCase()) ?? [];
      const parts = [`${count} exercices`];
      if (optional.length) parts.push(`${optional.join(" et ")} optionnels`);
      return { title, subtitle: parts.join(" · ") };
    }
  }
}

export async function getTodayView(db: Db, ownerId: string, now: Date): Promise<TodayView> {
  const [settings] = await db.select().from(personalSettings).where(eq(personalSettings.ownerId, ownerId)).limit(1);
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const { isoDate, weekday, hour } = localDateInfo(now, timeZone);

  const program = await loadActiveProgram(db);
  const dayFor = (wd: number) => program?.days.find((d) => d.weekday === wd);

  // Sessions of the last 8 days are enough to cover the current week in any time zone.
  const since = new Date(now.getTime() - 8 * 86_400_000);
  const recent = await db
    .select({ id: workoutSessions.id, status: workoutSessions.status, startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .where(and(gte(workoutSessions.startedAt, since), inArray(workoutSessions.status, ["completed", "in_progress", "paused"])));

  const completedDates = new Set(
    recent.filter((s) => s.status === "completed").map((s) => localDateInfo(s.startedAt, timeZone).isoDate),
  );
  const active = recent.find((s) => s.status === "in_progress" || s.status === "paused");

  const dates = weekDates(isoDate, weekday);
  const week: WeekDay[] = dates.map((date, i) => {
    const wd = i + 1;
    const day = dayFor(wd);
    let status: WeekDayStatus;
    if (completedDates.has(date)) status = "done";
    else if (!program) status = "none";
    else if (!day || day.kind === "rest") status = "rest";
    else if (day.kind === "recovery") status = "recovery";
    else if (date === isoDate) status = "today";
    else if (date < isoDate) status = "missed";
    else status = "planned";
    return { isoDate: date, weekday: wd, dayOfMonth: dayOfMonth(date), status, isToday: date === isoDate };
  });

  const upcoming: UpcomingDay[] = [];
  if (program) {
    for (let i = 1; i <= 2; i++) {
      const date = addDays(isoDate, i);
      const wd = ((weekday - 1 + i) % 7) + 1;
      const day = dayFor(wd);
      if (!day) continue;
      upcoming.push({ isoDate: date, weekday: wd, dayOfMonth: dayOfMonth(date), kind: day.kind, ...describeDay(day) });
    }
  }

  return {
    isoDate,
    dateLabel: formatLongDate(isoDate),
    greeting: greetingFor(hour),
    displayName: settings?.displayName ?? null,
    programVersion: program?.version ?? null,
    today: dayFor(weekday) ?? null,
    doneToday: completedDates.has(isoDate),
    activeSessionId: active?.id ?? null,
    week,
    completedThisWeek: week.filter((d) => d.status === "done").length,
    plannedThisWeek: dates.filter((_, i) => isTrainingDay(dayFor(i + 1))).length,
    upcoming,
  };
}
