"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { deleteSession } from "@/features/auth/session";
import { clearSessionCookie, readSessionToken } from "@/lib/auth/cookie";

/** Safe without a session check: it only ever removes the caller's own session. */
export async function signOutAction() {
  await deleteSession(getDb(), await readSessionToken());
  await clearSessionCookie();
  redirect("/sign-in");
}
