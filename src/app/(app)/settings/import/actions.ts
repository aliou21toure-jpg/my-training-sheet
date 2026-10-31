"use server";

/**
 * Import preview: validates the upload, parses it in memory and returns the
 * draft program. Nothing is written to disk or to the database here.
 * Saving the program is a separate, later action.
 */
import { parseWorkbook } from "@/features/import/parse-workbook";
import type { ImportIssue, ProgramDraft } from "@/features/import/types";
import { validateUpload } from "@/features/import/validate-upload";
import { privateActionsAllowed } from "@/lib/auth/guard";

export type PreviewState =
  | { status: "idle" }
  | { status: "error"; message: string; fileName: string | null }
  | { status: "ready"; fileName: string; program: ProgramDraft; issues: ImportIssue[] };

export async function previewImport(_previous: PreviewState, formData: FormData): Promise<PreviewState> {
  if (!privateActionsAllowed()) {
    return { status: "error", message: "L'import sera disponible une fois la connexion en place.", fileName: null };
  }

  const check = validateUpload(formData.get("workbook"));
  if (!check.ok) return { status: "error", message: check.message, fileName: null };

  const bytes = new Uint8Array(await check.file.arrayBuffer());
  const result = await parseWorkbook(bytes);
  if (!result.ok) return { status: "error", message: result.error.message, fileName: check.file.name };

  return { status: "ready", fileName: check.file.name, program: result.program, issues: result.issues };
}
