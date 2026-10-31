import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Db } from "./types";

// One small pool per server instance; reused across hot reloads in development.
const globalForDb = globalThis as unknown as { appDb?: Db };

/**
 * The app database, created on first use (not at import), so `next build`
 * and CI work without a DATABASE_URL.
 */
export function getDb(): Db {
  if (globalForDb.appDb) return globalForDb.appDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const db: Db = drizzle(postgres(url, { max: 5 }), { schema });
  globalForDb.appDb = db;
  return db;
}

export type { Db };
