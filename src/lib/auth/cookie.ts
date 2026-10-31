import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "mts_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript
    secure: process.env.NODE_ENV === "production", // HTTPS only once deployed
    sameSite: "lax", // not sent on cross-site POSTs
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
