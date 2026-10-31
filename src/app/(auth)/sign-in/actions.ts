"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { clientKey } from "@/features/auth/rate-limit";
import { safeRedirectPath, signInWithPassword } from "@/features/auth/sign-in";
import { setSessionCookie } from "@/lib/auth/cookie";

export type SignInState = { error: string | null };

export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip");

  const result = await signInWithPassword(getDb(), {
    email: formData.get("email"),
    password: formData.get("password"),
    clientKey: clientKey(ip),
  });

  if (!result.ok) {
    return {
      error:
        result.reason === "locked"
          ? "Trop de tentatives. Réessaie dans 15 minutes."
          : "Email ou mot de passe incorrect.",
    };
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect(safeRedirectPath(formData.get("next")));
}
