/**
 * Data for the Calendar screen: a week or a month of resolved days,
 * with completed workouts placed on their local date.
 */
import { and, gte, inArray, lte } from "drizzle-orm";
import { workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadActiveProgram, type PlannedBlock } from "@/features/program/load-program";
import { resolveRange, MAX_DAYS_AHEAD } from "@/features/schedule/schedule";
import { getTimeZone } from "@/features/settings/owner-settings";
import { describeDay } from "@/features/today/get-today";
import type { WorkoutSnapshot } from "@/features/workouts/snapshot";
import { addDays, dayOfMonth, localDateInfo, weekDates } from "@/lib/dates/local-date";

export type CalendarView = "week" | "month";
export type CalendarStatus = "done" | "missed" | "today" | "planned" | "recovery" | "rest" | "none";

export interface CalendarDay {
  isoDate: string;
  weekday: number;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  editable: boolean;
  status: CalendarStatus;
  kind: "strength" | "recovery" | "rest" | "choice" | null;
  title: string;
  subtitle: string;
  options: { number: number; label: string }[];
  selectedOption: number | null;
  movedFrom: string | null;
  blocks: PlannedBlock[];
  sessions: { id: string; title: string; status: "completed" | "in_progress" | "paused" }[];
}

export interface CalendarData {
  view: CalendarView;
  anchor: string;
  today: string;
  label: string;
  prev: string;
  next: string;
  days: CalendarDay[];
  hasProgram: boolean;
}

export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const shortLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function rangeFor(view: CalendarView, anchor: string): { dates: string[]; label: string; prev: string; next: string } {
  const weekday = ((new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  if (view === "week") {
    const dates = weekDates(anchor, weekday);
    return { dates, label: `${shortLabel(dates[0]!)} – ${shortLabel(dates[6]!)}`, prev: addDays(anchor, -7), next: addDays(anchor, 7) };
  }
  const first = `${anchor.slice(0, 7)}-01`;
  const firstWeekday = ((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const start = addDays(first, 1 - firstWeekday);
  const nextMonth = new Date(`${first}T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const nextFirst = nextMonth.toISOString().slice(0, 10);
  const prevMonth = new Date(`${first}T12:00:00Z`);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  const dates: string[] = [];
  for (let d = start; d < nextFirst || dates.length % 7 !== 0; d = addDays(d, 1)) dates.push(d);
  const month = monthLabel(first);
  return { dates, label: month.charAt(0).toUpperCase() + month.slice(1), prev: prevMonth.toISOString().slice(0, 10), next: nextFirst };
}

export async function getCalendar(db: Db, ownerId: string, now: Date, view: CalendarView, anchorInput: string | null): Promise<CalendarData> {
  const timeZone = await getTimeZone(db, ownerId);
  const today = localDateInfo(now, timeZone).isoDate;
  const anchor = anchorInput ?? today;
  const { dates, label, prev, next } = rangeFor(view, anchor);

  const program = await loadActiveProgram(db);
  const schedule = await resolveRange(db, program, dates);

  const from = new Date(new Date(`${dates[0]}T00:00:00Z`).getTime() - 86_400_000);
  const to = new Date(new Date(`${dates.at(-1)}T00:00:00Z`).getTime() + 2 * 86_400_000);
  const sessions = await db
    .select({ id: workoutSessions.id, status: workoutSessions.status, startedAt: workoutSessions.startedAt, snapshot: workoutSessions.planSnapshot })
    .from(workoutSessions)
    .where(and(inArray(workoutSessions.status, ["completed", "in_progress", "paused"]), gte(workoutSessions.startedAt, from), lte(workoutSessions.startedAt, to)));
  const byDate = new Map<string, CalendarDay["sessions"]>();
  for (const s of sessions) {
    const date = localDateInfo(s.startedAt, timeZone).isoDate;
    const title = (s.snapshot as unknown as WorkoutSnapshot).title ?? "Séance";
    byDate.set(date, [...(byDate.get(date) ?? []), { id: s.id, title, status: s.status as CalendarDay["sessions"][number]["status"] }]);
  }
  const lastEditable = addDays(today, MAX_DAYS_AHEAD);

  const days = dates.map((isoDate): CalendarDay => {
    const resolved = schedule.get(isoDate)!;
    const day = resolved.day;
    const done = (byDate.get(isoDate) ?? []).filter((s) => s.status === "completed");
    let status: CalendarStatus;
    if (done.length) status = "done";
    else if (!program) status = "none";
    else if (!day || day.kind === "rest") status = "rest";
    else if (day.kind === "recovery") status = "recovery";
    else if (isoDate === today) status = "today";
    else if (isoDate < today) status = "missed";
    else status = "planned";

    const option = resolved.optionNumber;
    const variant = day ? (day.variants.find((v) => v.number === option) ?? (day.kind === "choice" ? null : day.variants[0])) : null;
    const described = day ? describeDay(day) : { title: program ? "Repos" : "—", subtitle: "" };
    const hasSession = (byDate.get(isoDate) ?? []).length > 0;

    return {
      isoDate,
      weekday: resolved.weekday,
      dayOfMonth: dayOfMonth(isoDate),
      inMonth: view === "week" || isoDate.slice(0, 7) === anchor.slice(0, 7),
      isToday: isoDate === today,
      editable: !!program && isoDate >= today && isoDate <= lastEditable && !hasSession,
      status,
      kind: day?.kind ?? null,
      title: day?.kind === "choice" ? (variant ? `Option ${variant.number} · ${variant.label}` : "Séance au choix") : described.title,
      subtitle: described.subtitle,
      options: day?.kind === "choice" ? day.variants.map((v) => ({ number: v.number, label: v.label })) : [],
      selectedOption: option,
      movedFrom: resolved.movedFrom,
      blocks: variant?.blocks ?? [],
      sessions: byDate.get(isoDate) ?? [],
    };
  });

  return { view, anchor, today, label, prev, next, days, hasProgram: !!program };
}
