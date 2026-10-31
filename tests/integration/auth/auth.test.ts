import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authSessions, loginAttempts, ownerAccount } from "@/db/schema";
import type { Db } from "@/db/types";
import { hashPassword, verifyPassword } from "@/features/auth/password";
import { ATTEMPT_WINDOW_MINUTES, MAX_FAILED_ATTEMPTS, clientKey } from "@/features/auth/rate-limit";
import { createSession, deleteExpiredSessions, deleteSession, hashSessionToken, validateSessionToken } from "@/features/auth/session";
import { safeRedirectPath, signInWithPassword } from "@/features/auth/sign-in";
import { createTestDb } from "../db/test-db";

const EMAIL = "owner@example.test";
const PASSWORD = "correct horse battery staple";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let ownerId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  const [owner] = await db
    .insert(ownerAccount)
    .values({ email: EMAIL, passwordHash: await hashPassword(PASSWORD) })
    .returning();
  ownerId = owner!.id;
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("password hashing", () => {
  it("uses argon2id and verifies only the right password", async () => {
    const h = await hashPassword("s3cret-password!");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "s3cret-password!")).toBe(true);
    expect(await verifyPassword(h, "S3cret-password!")).toBe(false);
  });

  it("returns false (no crash) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("sessions", () => {
  it("stores only the token's hash and recognises the token", async () => {
    const { token, expiresAt } = await createSession(db, ownerId);
    const rows = await db.select().from(authSessions).where(eq(authSessions.ownerId, ownerId));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect(rows.some((r) => r.tokenHash === hashSessionToken(token))).toBe(true);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(await validateSessionToken(db, token)).toEqual({ id: ownerId, email: EMAIL });
  });

  it("rejects missing, unknown, absurd and expired tokens", async () => {
    expect(await validateSessionToken(db, undefined)).toBeNull();
    expect(await validateSessionToken(db, "nope")).toBeNull();
    expect(await validateSessionToken(db, "x".repeat(10_000))).toBeNull();

    const past = new Date(Date.now() - 31 * 86_400_000);
    const { token } = await createSession(db, ownerId, past);
    expect(await validateSessionToken(db, token)).toBeNull();
    await deleteExpiredSessions(db);
    const left = await db.select().from(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
    expect(left).toHaveLength(0);
  });

  it("signing out invalidates the session", async () => {
    const { token } = await createSession(db, ownerId);
    await deleteSession(db, token);
    expect(await validateSessionToken(db, token)).toBeNull();
  });
});

describe("sign-in", () => {
  it("signs in with the right email (any case) and password", async () => {
    const r = await signInWithPassword(db, { email: "  OWNER@example.test ", password: PASSWORD, clientKey: clientKey("10.0.0.1") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await validateSessionToken(db, r.token)).toMatchObject({ id: ownerId });
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const key = clientKey("10.0.0.2");
    expect(await signInWithPassword(db, { email: EMAIL, password: "wrong", clientKey: key })).toEqual({ ok: false, reason: "invalid" });
    expect(await signInWithPassword(db, { email: "nobody@example.test", password: PASSWORD, clientKey: key })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects malformed input without throwing", async () => {
    for (const input of [{ email: null, password: null }, { email: "not-an-email", password: "x" }, { email: EMAIL, password: "" }]) {
      expect(await signInWithPassword(db, { ...input, clientKey: clientKey("10.0.0.3") })).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it(`locks a client out after ${MAX_FAILED_ATTEMPTS} failures, even with the right password`, async () => {
    const key = clientKey("10.0.0.4");
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await signInWithPassword(db, { email: EMAIL, password: "guess", clientKey: key });
    }
    expect(await signInWithPassword(db, { email: EMAIL, password: PASSWORD, clientKey: key })).toEqual({ ok: false, reason: "locked" });

    // Another client is not affected.
    expect((await signInWithPassword(db, { email: EMAIL, password: PASSWORD, clientKey: clientKey("10.0.0.5") })).ok).toBe(true);

    // After the window, the client can try again.
    const later = new Date(Date.now() + (ATTEMPT_WINDOW_MINUTES + 1) * 60_000);
    expect((await signInWithPassword(db, { email: EMAIL, password: PASSWORD, clientKey: key }, later)).ok).toBe(true);
  });

  it("never stores the raw IP", async () => {
    const rows = await db.select({ key: loginAttempts.key }).from(loginAttempts);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.key))).toBe(true);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/settings/import", "/settings/import"],
    ["/", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example", "/"],
    [undefined, "/"],
    [["/a", "/b"], "/"],
  ])("%j → %j", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });
});
