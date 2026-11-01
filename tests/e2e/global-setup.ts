/**
 * Fresh database for every E2E run: drop everything, apply the migrations,
 * create the test owner. Refuses to run against anything that does not look
 * like a disposable test database.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { ownerAccount, personalSettings } from "../../src/db/schema";
import { hashPassword } from "../../src/features/auth/password";
import { E2E_EMAIL, E2E_PASSWORD } from "./helpers";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://mts:mts@localhost:5432/my_training_sheet_e2e";
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "postgres"].includes(host)) {
    throw new Error(`E2E refuses to wipe a non-local database (${host}).`);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [owner] = await db.insert(ownerAccount).values({ email: E2E_EMAIL, passwordHash: await hashPassword(E2E_PASSWORD) }).returning();
    await db.insert(personalSettings).values({ ownerId: owner!.id, displayName: "Alex", timezone: "Europe/Paris" });
  } finally {
    await client.end();
  }
}
