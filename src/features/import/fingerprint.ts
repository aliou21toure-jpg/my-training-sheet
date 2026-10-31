/**
 * SHA-256 of the uploaded bytes. Stored in import_batches.file_sha256
 * (unique), so importing the exact same file twice is detected before
 * anything is written.
 */
import { createHash } from "node:crypto";

export function workbookFingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
