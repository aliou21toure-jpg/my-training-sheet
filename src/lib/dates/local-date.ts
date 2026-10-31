/**
 * Calendar dates in the owner's time zone.
 *
 * Events are stored as UTC instants; "which day is it?" depends on where
 * the owner is. A workout finished at 23:30 in Paris belongs to that Paris
 * day even though it is already the next day in UTC (or the reverse).
 *
 * Calendar days are handled as "YYYY-MM-DD" strings: no hidden time zone.
 */

export const DEFAULT_TIME_ZONE = "Europe/Paris";

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface LocalDateInfo {
  /** "2026-10-31" */
  isoDate: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** 0–23, local wall-clock hour. */
  hour: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function localDateInfo(instant: Date, timeZone: string): LocalDateInfo {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday ?? ""] ?? 1,
    hour: Number(parts.hour) % 24,
  };
}

function toUtcDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDays(isoDate: string, days: number): string {
  const date = toUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The 7 dates (Monday → Sunday) of the week containing isoDate. */
export function weekDates(isoDate: string, weekday: number): string[] {
  const monday = addDays(isoDate, 1 - weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "samedi 31 octobre" */
export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    toUtcDate(isoDate),
  );
}

export function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

export function greetingFor(hour: number): string {
  return hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
}
