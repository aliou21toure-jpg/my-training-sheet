import { eq } from "drizzle-orm";
import { personalSettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { DEFAULT_TIME_ZONE, localDateInfo } from "@/lib/dates/local-date";

export async function getTimeZone(db: Db, ownerId: string): Promise<string> {
  const [row] = await db.select({ tz: personalSettings.timezone }).from(personalSettings).where(eq(personalSettings.ownerId, ownerId));
  return row?.tz ?? DEFAULT_TIME_ZONE;
}

/** Today's calendar date ("2026-11-02") in the owner's time zone. */
export async function todayIsoDate(db: Db, ownerId: string, now: Date): Promise<string> {
  return localDateInfo(now, await getTimeZone(db, ownerId)).isoDate;
}

export interface OwnerSettings {
  displayName: string | null;
  theme: "system" | "light" | "dark";
  unit: "kg" | "lb";
  timezone: string;
  reminderEnabled: boolean;
  reminderTime: string | null;
}

export async function getOwnerSettings(db: Db, ownerId: string): Promise<OwnerSettings> {
  const [row] = await db.select().from(personalSettings).where(eq(personalSettings.ownerId, ownerId));
  return {
    displayName: row?.displayName ?? null,
    theme: row?.theme ?? "system",
    unit: row?.unit ?? "kg",
    timezone: row?.timezone ?? DEFAULT_TIME_ZONE,
    reminderEnabled: row?.reminderEnabled ?? false,
    reminderTime: row?.reminderTime ? row.reminderTime.slice(0, 5) : null,
  };
}
