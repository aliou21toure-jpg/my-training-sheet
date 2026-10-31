import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Any Drizzle Postgres database with our schema: postgres-js in the app,
 * PGlite in tests. Business functions take a `Db` parameter instead of
 * importing the app client, so tests can hand them an in-memory database.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
