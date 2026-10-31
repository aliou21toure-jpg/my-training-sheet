/**
 * Entry point of the import: bytes of an .xlsx file → ImportResult.
 *
 * Runs on the server only. The file is read in memory and never written
 * to disk. All interpretation lives in parse-program.ts; this file only
 * validates the bytes and turns worksheets into plain rows.
 */
import ExcelJS from "exceljs";
import { parseProgram } from "./parse-program";
import type { ImportResult, SheetRow } from "./types";

/**
 * 900 KB: the real file is ~10 KB, and Server Actions refuse request
 * bodies over 1 MB by default (multipart overhead included).
 */
export const MAX_WORKBOOK_BYTES = 900 * 1024;

/** .xlsx files are ZIP archives: they start with "PK\x03\x04". */
function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function cellText(cell: ExcelJS.Cell): string {
  // A merged cell repeats its master's value; only the master counts.
  if (cell.type === ExcelJS.ValueType.Merge) return "";
  const text = cell.text;
  return typeof text === "string" ? text : String(text ?? "");
}

export function worksheetRows(ws: ExcelJS.Worksheet): SheetRow[] {
  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const a = cellText(row.getCell(1));
    const b = cellText(row.getCell(2));
    const c = cellText(row.getCell(3));
    if (a.trim() || b.trim() || c.trim()) rows.push({ row: rowNumber, a, b, c });
  });
  return rows;
}

export async function parseWorkbook(data: ArrayBuffer | Uint8Array): Promise<ImportResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (bytes.byteLength > MAX_WORKBOOK_BYTES) {
    return { ok: false, error: { code: "too_large", message: "Fichier trop volumineux (900 Ko maximum)." } };
  }
  if (!isZip(bytes)) {
    return { ok: false, error: { code: "not_xlsx", message: "Ce fichier n'est pas un classeur Excel (.xlsx)." } };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(buffer);
  } catch {
    return { ok: false, error: { code: "corrupt", message: "Le classeur est illisible ou endommagé." } };
  }

  const sheets = new Map<string, SheetRow[]>();
  for (const ws of workbook.worksheets) sheets.set(ws.name, worksheetRows(ws));
  return parseProgram(sheets);
}
