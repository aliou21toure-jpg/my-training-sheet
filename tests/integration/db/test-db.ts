/**
 * A real PostgreSQL engine in memory (PGlite), with the project's
 * migrations applied. No Docker needed: CI and laptops run the same thing.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, client, close: () => client.close() };
}

/** Postgres error code of a failed query (23505 = unique, 23514 = check, 23503 = foreign key). */
export function pgCode(error: unknown): string | undefined {
  let e: unknown = error;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
