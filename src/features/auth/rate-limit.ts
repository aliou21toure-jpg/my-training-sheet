/**
 * At most 5 failed sign-ins per client in 15 minutes.
 * Stored in Postgres so the limit holds across serverless instances.
 */
import { createHash } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { loginAttempts } from "@/db/schema";
import type { Db } from "@/db/types";

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 15;

/** The raw IP is never stored, only a hash of it. */
export function clientKey(ip: string | null | undefined): string {
  return createHash("sha256").update(`login:${ip?.trim() || "unknown"}`).digest("hex");
}

function windowStart(now: Date) {
  return new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60_000);
}

export async function isLockedOut(db: Db, key: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), eq(loginAttempts.succeeded, false), gt(loginAttempts.attemptedAt, windowStart(now))));
  return (row?.n ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordAttempt(db: Db, key: string, succeeded: boolean, now = new Date()) {
  await db.insert(loginAttempts).values({ key, succeeded, attemptedAt: now });
  if (succeeded) {
    // A successful sign-in clears this client's failures.
    await db.delete(loginAttempts).where(and(eq(loginAttempts.key, key), eq(loginAttempts.succeeded, false)));
  }
  // Housekeeping: drop rows older than a day.
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(now.getTime() - 86_400_000)));
}
