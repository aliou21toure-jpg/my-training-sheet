import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerAccount, personalSettings, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import { getTodayView } from "@/features/today/get-today";
import { buildSampleWorkbook } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let ownerId: string;

// Saturday 31 Oct 2026, 11:00 in Paris.
const SATURDAY = new Date("2026-10-31T10:00:00Z");

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  const [owner] = await db.insert(ownerAccount).values({ email: "o@example.test", passwordHash: "x" }).returning();
  ownerId = owner!.id;
  await db.insert(personalSettings).values({ ownerId, displayName: "Alex", timezone: "Europe/Paris" });
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("getTodayView", () => {
  it("shows an empty state before any program is imported", async () => {
    const view = await getTodayView(db, ownerId, SATURDAY);
    expect(view).toMatchObject({ programVersion: null, today: null, plannedThisWeek: 0, upcoming: [] });
    expect(view.week.every((d) => d.status === "none")).toBe(true);
    expect(view.greeting).toBe("Bonjour");
    expect(view.displayName).toBe("Alex");
  });

  it("shows today's plan from the active program", async () => {
    const bytes = await buildSampleWorkbook();
    const parsed = await parseWorkbook(bytes);
    if (!parsed.ok) throw new Error(parsed.error.message);
    await saveProgramDraft(db, {
      program: parsed.program,
      issues: parsed.issues,
      fileName: "p.xlsx",
      fileSize: bytes.byteLength,
      fileSha256: workbookFingerprint(bytes),
    });

    const view = await getTodayView(db, ownerId, SATURDAY);
    expect(view.dateLabel).toBe("samedi 31 octobre");
    expect(view.today).toMatchObject({ weekday: 6, kind: "choice" });
    expect(view.today!.variants.map((v) => v.label)).toEqual(["Circuit", "HIIT", "Conditioning"]);
    expect(view.plannedThisWeek).toBe(5); // Mon, Tue, Thu, Fri, Sat
  });

  it("marks the week: missed, recovery, today, rest — and upcoming days", async () => {
    const view = await getTodayView(db, ownerId, SATURDAY);
    expect(view.week.map((d) => d.status)).toEqual(["missed", "missed", "recovery", "missed", "missed", "today", "rest"]);
    expect(view.week.find((d) => d.isToday)?.isoDate).toBe("2026-10-31");
    expect(view.upcoming.map((u) => [u.isoDate, u.kind, u.title])).toEqual([
      ["2026-11-01", "rest", "Repos complet"],
      ["2026-11-02", "strength", "Lower body + abs"],
    ]);
    // Monday's required strength block has 3 exercises; abs and finisher are optional.
    expect(view.upcoming[1]!.subtitle).toBe("3 exercices · abdos et finisher optionnels");
  });

  it("counts completed sessions on their LOCAL day", async () => {
    const done = (startedAt: string) => ({
      planSnapshot: {},
      idempotencyKey: randomUUID(),
      status: "completed" as const,
      startedAt: new Date(startedAt),
      endedAt: new Date(new Date(startedAt).getTime() + 3_600_000),
    });
    // Monday 18:00 Paris, and Thursday 23:30 Paris (= 22:30 UTC, still Thursday locally)
    await db.insert(workoutSessions).values([done("2026-10-26T17:00:00Z"), done("2026-10-29T22:30:00Z")]);

    const view = await getTodayView(db, ownerId, SATURDAY);
    expect(view.week.map((d) => d.status)).toEqual(["done", "missed", "recovery", "done", "missed", "today", "rest"]);
    expect(view.completedThisWeek).toBe(2);
    expect(view.doneToday).toBe(false);
  });

  it("offers to resume an unfinished session", async () => {
    const [s] = await db
      .insert(workoutSessions)
      .values({ planSnapshot: {}, idempotencyKey: randomUUID(), startedAt: new Date("2026-10-31T09:00:00Z") })
      .returning();
    const view = await getTodayView(db, ownerId, SATURDAY);
    expect(view.activeSessionId).toBe(s!.id);
  });

  it("on Sunday shows a rest day and next week's Monday", async () => {
    const sunday = new Date("2026-11-01T09:00:00Z");
    const view = await getTodayView(db, ownerId, sunday);
    expect(view.today?.kind).toBe("rest");
    expect(view.week[0]!.isoDate).toBe("2026-10-26"); // still the same week
    expect(view.upcoming[0]).toMatchObject({ isoDate: "2026-11-02", kind: "strength" });
  });
});
