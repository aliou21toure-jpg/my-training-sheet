/**
 * Optimistic check only: no session cookie → straight to the sign-in page.
 * It never trusts the cookie's content; pages and actions call
 * requireOwner(), which validates the session against the database.
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mts_session"; // kept in sync with lib/auth/cookie.ts

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  // Only page navigations are redirected. A Server Action (POST) answered with
  // the sign-in HTML would crash the client; the action checks the session
  // itself and returns a proper redirect.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from !== "/") url.searchParams.set("next", from);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except sign-in, API routes (they answer 401 themselves), Next internals and static files.
  matcher: ["/((?!sign-in|api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
