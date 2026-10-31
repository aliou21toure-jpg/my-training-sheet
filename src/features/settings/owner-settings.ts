import { eq } from "drizzle-orm";
import { personalSettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { DEFAULT_TIME_ZONE, localDateInfo } from "@/lib/dates/local-date";

export async function getTimeZone(db: Db, ownerId: string): Promise<string> {
  const [row] = await db.select({ tz: personalSettings.timezone }).from(personalSettings).where(eq(personalSettings.ownerId, ownerId));
  return row?.tz ?? DEFAULT_TIME_ZONE;
}

/** Today's ISO weekday (1 = Monday) in the owner's time zone. */
export async function todayWeekday(db: Db, ownerId: string, now: Date): Promise<number> {
  return localDateInfo(now, await getTimeZone(db, ownerId)).weekday;
}
