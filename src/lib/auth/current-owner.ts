import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { validateSessionToken, type SessionOwner } from "@/features/auth/session";
import { readSessionToken } from "./cookie";

/**
 * The real authorization check (the proxy only does an optimistic redirect).
 * Cached per request: several components can call it for one DB query.
 */
export const getCurrentOwner = cache(async (): Promise<SessionOwner | null> => {
  // Read the cookie first: it marks the render as request-time, and with no
  // cookie there is nothing to look up.
  const token = await readSessionToken();
  if (!token) return null;
  return validateSessionToken(getDb(), token);
});

/** For pages and Server Actions: the owner, or a redirect to the sign-in page. */
export async function requireOwner(): Promise<SessionOwner> {
  const owner = await getCurrentOwner();
  if (!owner) redirect("/sign-in");
  return owner;
}
