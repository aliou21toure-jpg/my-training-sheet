"use server";

import { getDb } from "@/db/client";
import { saveEditedProgram, type SaveEditResult } from "@/features/program/edit-program";
import { requireOwner } from "@/lib/auth/current-owner";

export async function saveProgramAction(draft: unknown): Promise<SaveEditResult> {
  await requireOwner();
  return saveEditedProgram(getDb(), draft);
}
