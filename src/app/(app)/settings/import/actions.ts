"use server";

/**
 * Import: preview, then save.
 *
 * Both actions receive the FILE, never a program built by the browser:
 * the server re-reads the workbook itself before saving, so what is
 * stored is exactly what the parser produced from the bytes.
 */
import { getDb } from "@/db/client";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import type { ImportIssue, ImportResult, ProgramDraft } from "@/features/import/types";
import { validateUpload } from "@/features/import/validate-upload";
import { requireOwner } from "@/lib/auth/current-owner";

export type PreviewState =
  | { status: "idle" }
  | { status: "error"; message: string; fileName: string | null }
  | { status: "ready"; fileName: string; program: ProgramDraft; issues: ImportIssue[] };

export type SaveState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; version: number; exerciseCount: number };

type ReadUpload =
  | { ok: true; file: File; bytes: Uint8Array; result: Extract<ImportResult, { ok: true }> }
  | { ok: false; message: string; fileName: string | null };

async function readUpload(formData: FormData): Promise<ReadUpload> {
  const check = validateUpload(formData.get("workbook"));
  if (!check.ok) return { ok: false, message: check.message, fileName: null };

  const bytes = new Uint8Array(await check.file.arrayBuffer());
  const result = await parseWorkbook(bytes);
  if (!result.ok) return { ok: false, message: result.error.message, fileName: check.file.name };
  return { ok: true, file: check.file, bytes, result };
}

export async function previewImport(_previous: PreviewState, formData: FormData): Promise<PreviewState> {
  // Server Actions are public HTTP endpoints: each one checks the session itself,
  // even though the page around it is already protected.
  await requireOwner();

  const upload = await readUpload(formData);
  if (!upload.ok) return { status: "error", message: upload.message, fileName: upload.fileName };

  return {
    status: "ready",
    fileName: upload.file.name,
    program: upload.result.program,
    issues: upload.result.issues,
  };
}

export async function saveImport(_previous: SaveState, formData: FormData): Promise<SaveState> {
  await requireOwner();

  const upload = await readUpload(formData);
  if (!upload.ok) return { status: "error", message: upload.message };

  const saved = await saveProgramDraft(getDb(), {
    program: upload.result.program,
    issues: upload.result.issues,
    fileName: upload.file.name,
    fileSize: upload.bytes.byteLength,
    fileSha256: workbookFingerprint(upload.bytes),
  });

  if (!saved.ok) {
    return {
      status: "error",
      message:
        saved.version !== null
          ? `Ce fichier a déjà été importé (version ${saved.version}). Rien n’a été modifié.`
          : "Ce fichier a déjà été importé. Rien n’a été modifié.",
    };
  }
  return { status: "saved", version: saved.version, exerciseCount: saved.exerciseCount };
}
