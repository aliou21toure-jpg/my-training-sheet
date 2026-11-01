"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { eraseData, updateSettings } from "@/features/settings/update-settings";
import { requireOwner } from "@/lib/auth/current-owner";

export type SettingsState = { status: "idle" | "saved" | "error"; message?: string };

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const owner = await requireOwner();
  try {
    await updateSettings(getDb(), owner.id, {
      displayName: String(formData.get("displayName") ?? ""),
      theme: formData.get("theme"),
      unit: formData.get("unit"),
      timezone: formData.get("timezone"),
      reminderEnabled: formData.get("reminderEnabled") === "on",
      reminderTime: (formData.get("reminderTime") as string) || null,
    });
    return { status: "saved" };
  } catch (error) {
    if (error instanceof ZodError) return { status: "error", message: error.issues[0]?.message ?? "Valeurs invalides." };
    throw error;
  }
}

export type EraseState = { error: string | null };

export async function eraseAction(_prev: EraseState, formData: FormData): Promise<EraseState> {
  await requireOwner();
  const scope = formData.get("scope") === "everything" ? "everything" : "history";
  try {
    await eraseData(getDb(), scope, String(formData.get("confirmation") ?? ""));
  } catch (error) {
    if (error instanceof Error && error.message === "confirmation") return { error: "Tape EFFACER pour confirmer." };
    throw error;
  }
  redirect(scope === "everything" ? "/settings/import" : "/");
}
