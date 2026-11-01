import { getDb } from "@/db/client";
import { exportCsv, exportJson } from "@/features/settings/export-data";
import { getTimeZone } from "@/features/settings/owner-settings";
import { getCurrentOwner } from "@/lib/auth/current-owner";

/** GET /api/export?format=json|csv — private: owner session required. */
export async function GET(request: Request) {
  const owner = await getCurrentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const date = new Date().toISOString().slice(0, 10);
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="my-training-sheet-${date}.${format}"`,
  };

  if (format === "csv") {
    const csv = await exportCsv(db, await getTimeZone(db, owner.id));
    return new Response(`﻿${csv}`, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  return new Response(JSON.stringify(await exportJson(db, owner.id), null, 2), {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
