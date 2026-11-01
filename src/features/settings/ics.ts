/**
 * Workout reminders as a calendar file (.ics). Added once to the iPhone or
 * Mac calendar, it gives a notification on each training day at the chosen
 * time — no push server needed. It is a snapshot of the next 4 weeks:
 * download it again after moving workouts.
 */
import type { ScheduledDay } from "@/features/schedule/schedule";

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(days: ScheduledDay[], time: string, timeZone: string, now: Date): string {
  const [h, m] = time.split(":");
  const events = days
    .filter((d) => d.day && (d.day.kind === "strength" || d.day.kind === "choice" || d.day.kind === "recovery"))
    .map((d) => {
      const day = d.day!;
      const variant = d.optionNumber ? day.variants.find((v) => v.number === d.optionNumber) : null;
      const title = day.kind === "recovery" ? "Récupération active" : variant ? `Séance · ${variant.label}` : `Séance · ${day.focus ?? day.title ?? "entraînement"}`;
      const date = d.isoDate.replace(/-/g, "");
      return [
        "BEGIN:VEVENT",
        `UID:mts-${d.isoDate}@my-training-sheet`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;TZID=${timeZone}:${date}T${h}${m}00`,
        `DURATION:PT${day.kind === "recovery" ? 40 : 60}M`,
        fold(`SUMMARY:${escapeText(title)}`),
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        fold(`DESCRIPTION:${escapeText(title)}`),
        "TRIGGER:PT0M",
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//My Training Sheet//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Entraînement", ...events, "END:VCALENDAR", ""].join("\r\n");
}
