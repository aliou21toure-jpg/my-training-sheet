import { getDb } from "@/db/client";
import { buildIcs } from "@/features/settings/ics";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { loadActiveProgram } from "@/features/program/load-program";
import { resolveRange } from "@/features/schedule/schedule";
import { getCurrentOwner } from "@/lib/auth/current-owner";
import { addDays, localDateInfo } from "@/lib/dates/local-date";

/** GET /api/reminders — the next 4 weeks of workouts as an .ics file with alarms. */
export async function GET() {
  const owner = await getCurrentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  const settings = await getOwnerSettings(db, owner.id);
  const now = new Date();
  const today = localDateInfo(now, settings.timezone).isoDate;
  const dates = Array.from({ length: 28 }, (_, i) => addDays(today, i));
  const schedule = await resolveRange(db, await loadActiveProgram(db), dates);
  const ics = buildIcs([...schedule.values()], settings.reminderTime ?? "18:00", settings.timezone, now);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="entrainement.ics"',
      "Cache-Control": "no-store",
    },
  });
}
