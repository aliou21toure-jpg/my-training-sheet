/**
 * Server-side sessions.
 *
 * The browser holds a random 256-bit token in an httpOnly cookie. The
 * database only stores its SHA-256, so a leaked database cannot be used to
 * log in. Sessions last 30 days; signing out deletes the row.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { authSessions, ownerAccount } from "@/db/schema";
import type { Db } from "@/db/types";

export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: Db, ownerId: string, now = new Date()) {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  await db.insert(authSessions).values({ ownerId, tokenHash: hashSessionToken(token), expiresAt });
  return { token, expiresAt };
}

export interface SessionOwner {
  id: string;
  email: string;
}

/**
 * Returns the owner for a valid, unexpired token, or null.
 * Expiry is compared with the database clock (now()) unless a time is given
 * (tests): one clock for the whole check, and no Date during rendering.
 */
export async function validateSessionToken(db: Db, token: string | undefined, now?: Date): Promise<SessionOwner | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ id: ownerAccount.id, email: ownerAccount.email })
    .from(authSessions)
    .innerJoin(ownerAccount, eq(ownerAccount.id, authSessions.ownerId))
    .where(
      and(
        eq(authSessions.tokenHash, hashSessionToken(token)),
        gt(authSessions.expiresAt, now ?? sql`now()`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
}

export async function deleteExpiredSessions(db: Db, now = new Date()) {
  await db.delete(authSessions).where(lte(authSessions.expiresAt, now));
}
