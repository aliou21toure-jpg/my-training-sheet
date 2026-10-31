/**
 * The single owner, their login sessions and their settings.
 * There is no registration: the owner row is created once by a seed script.
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { theme, weightUnit } from "./enums";

export const ownerAccount = pgTable(
  "owner_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    /** Always true and unique: the database itself refuses a second account. */
    singleton: boolean("singleton").notNull().default(true).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("owner_account_singleton_true", sql`${t.singleton} = true`)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => ownerAccount.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token: a database leak does not leak usable sessions. */
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("auth_sessions_expires_at_idx").on(t.expiresAt)],
);

export const personalSettings = pgTable("personal_settings", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => ownerAccount.id, { onDelete: "cascade" }),
  theme: theme("theme").notNull().default("system"),
  unit: weightUnit("unit").notNull().default("kg"),
  /** IANA zone used to decide what "today" is for the training calendar. */
  timezone: text("timezone").notNull().default("Europe/Paris"),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderTime: time("reminder_time"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
