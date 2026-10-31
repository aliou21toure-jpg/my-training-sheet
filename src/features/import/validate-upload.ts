/**
 * First gate for an uploaded file, before any byte is parsed:
 * it must be a non-empty .xlsx under the size limit.
 * The zip signature and the workbook structure are checked by parseWorkbook.
 */
import { z } from "zod";
import { MAX_WORKBOOK_BYTES } from "./parse-workbook";

const ACCEPTED_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // some browsers / OSes send this for .xlsx
  "", // and some send nothing
]);

export const uploadSchema = z
  .instanceof(File, { message: "Choisis un fichier Excel." })
  .refine((f) => f.size > 0, "Le fichier est vide.")
  .refine((f) => f.size <= MAX_WORKBOOK_BYTES, "Fichier trop volumineux (900 Ko maximum).")
  .refine((f) => /\.xlsx$/i.test(f.name), "Seuls les fichiers .xlsx sont acceptés.")
  .refine((f) => ACCEPTED_TYPES.has(f.type), "Type de fichier non accepté.");

export type UploadCheck = { ok: true; file: File } | { ok: false; message: string };

export function validateUpload(value: unknown): UploadCheck {
  const parsed = uploadSchema.safeParse(value);
  if (parsed.success) return { ok: true, file: parsed.data };
  return { ok: false, message: parsed.error.issues[0]?.message ?? "Fichier invalide." };
}
