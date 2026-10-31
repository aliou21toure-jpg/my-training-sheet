/**
 * The whole sign-in decision, without cookies or HTTP: easy to test.
 * The Server Action only adds the cookie and the redirect around it.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ownerAccount } from "@/db/schema";
import type { Db } from "@/db/types";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { isLockedOut, recordAttempt } from "./rate-limit";
import { createSession } from "./session";

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export type SignInResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "locked" };

export async function signInWithPassword(
  db: Db,
  input: { email: unknown; password: unknown; clientKey: string },
  now = new Date(),
): Promise<SignInResult> {
  if (await isLockedOut(db, input.clientKey, now)) return { ok: false, reason: "locked" };

  const parsed = signInSchema.safeParse({ email: input.email, password: input.password });
  if (!parsed.success) {
    await recordAttempt(db, input.clientKey, false, now);
    return { ok: false, reason: "invalid" };
  }

  const [owner] = await db
    .select({ id: ownerAccount.id, passwordHash: ownerAccount.passwordHash })
    .from(ownerAccount)
    .where(eq(ownerAccount.email, parsed.data.email))
    .limit(1);

  const valid = owner
    ? await verifyPassword(owner.passwordHash, parsed.data.password)
    : await verifyAgainstDummy(parsed.data.password);

  await recordAttempt(db, input.clientKey, valid, now);
  if (!valid || !owner) return { ok: false, reason: "invalid" };

  const session = await createSession(db, owner.id, now);
  return { ok: true, ...session };
}

/** Only same-site paths are allowed as a post-login destination ("/today", not "//evil.com"). */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
