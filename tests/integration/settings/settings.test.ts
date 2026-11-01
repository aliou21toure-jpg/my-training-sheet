import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerAccount, personalSettings, setLogs, trainingPrograms, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import { loadActiveProgram } from "@/features/program/load-program";
import { resolveRange } from "@/features/schedule/schedule";
import { exportCsv, exportJson } from "@/features/settings/export-data";
import { buildIcs } from "@/features/settings/ics";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { eraseData, updateSettings } from "@/features/settings/update-settings";
import { finishSession, logSet, startWorkout } from "@/features/workouts/session";
import { parseSetDraft } from "@/features/workouts/set-values";
import { formatWeight, fromDisplayWeight, toDisplayWeight } from "@/lib/units";
import { buildSampleWorkbook } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let ownerId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  const [o] = await db.insert(ownerAccount).values({ email: "o@example.test", passwordHash: "secret-hash" }).returning();
  ownerId = o!.id;
  await db.insert(personalSettings).values({ ownerId });
  const bytes = await buildSampleWorkbook();
  const parsed = await parseWorkbook(bytes);
  if (!parsed.ok) throw new Error();
  await saveProgramDraft(db, { program: parsed.program, issues: parsed.issues, fileName: "p.xlsx", fileSize: 1, fileSha256: workbookFingerprint(bytes) });
  const { sessionId } = await startWorkout(db, { date: "2026-11-02", idempotencyKey: randomUUID() });
  await logSet(db, { sessionId, snapshotKey: "b1.e1", setNumber: 1, weightKg: 40, reps: 10, durationSeconds: null, completed: true });
  await finishSession(db, sessionId, "=HYPERLINK(\"evil\")");
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("kg / lb", () => {
  it("converts for display and back without drifting", () => {
    expect(toDisplayWeight(20, "lb")).toBe(44.1);
    expect(fromDisplayWeight(45, "lb")).toBe(20.41);
    expect(toDisplayWeight(fromDisplayWeight(45, "lb"), "lb")).toBe(45);
    expect(formatWeight(42.5, "kg")).toBe("42,5 kg");
  });

  it("a weight typed in lb is stored in kg", () => {
    expect(parseSetDraft({ setNumber: 1, weight: "100", reps: "5", duration: "", completed: true }, { input: "weightReps", durationUnit: "s" }, "lb")).toEqual({
      ok: true,
      weightKg: 45.36,
      reps: 5,
      durationSeconds: null,
    });
  });
});

describe("settings", () => {
  it("saves validated settings", async () => {
    await updateSettings(db, ownerId, { displayName: "  Alex ", theme: "dark", unit: "lb", timezone: "Africa/Bamako", reminderEnabled: true, reminderTime: null });
    expect(await getOwnerSettings(db, ownerId)).toEqual({
      displayName: "Alex",
      theme: "dark",
      unit: "lb",
      timezone: "Africa/Bamako",
      reminderEnabled: true,
      reminderTime: "18:00",
    });
  });

  it("refuses an unknown time zone, theme or time", async () => {
    const base = { displayName: "", theme: "light", unit: "kg", timezone: "Europe/Paris", reminderEnabled: false, reminderTime: null };
    await expect(updateSettings(db, ownerId, { ...base, timezone: "Mars/Olympus" })).rejects.toThrow();
    await expect(updateSettings(db, ownerId, { ...base, theme: "neon" })).rejects.toThrow();
    await expect(updateSettings(db, ownerId, { ...base, reminderTime: "25:00" })).rejects.toThrow();
  });
});

describe("export", () => {
  it("exports everything entered, never secrets", async () => {
    const data = await exportJson(db, ownerId);
    const text = JSON.stringify(data);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]!.sets[0]).toMatchObject({ exercise: "Squat", weightKg: 40, reps: 10, completed: true });
    expect(data.activeProgram?.days).toHaveLength(7);
    expect(text).not.toContain("secret-hash");
    expect(text).not.toMatch(/password|token/i);
  });

  it("CSV: one row per set, header first", async () => {
    const csv = await exportCsv(db, "Europe/Paris");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("date,workout,session_status,exercise,set,weight_kg,reps,duration_s,completed");
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},Lower body \+ abs,completed,Squat,1,40\.00,10,,yes$/);
  });
});

describe("reminders (.ics)", () => {
  it("creates an event with an alarm on each training or recovery day", async () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 2}`);
    const schedule = await resolveRange(db, await loadActiveProgram(db), dates);
    const ics = buildIcs([...schedule.values()], "07:30", "Europe/Paris", new Date("2026-11-01T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(6); // Mon–Sat; Sunday is rest
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(6);
    expect(ics).toContain("DTSTART;TZID=Europe/Paris:20261102T073000");
    expect(ics).toContain("SUMMARY:Récupération active");
  });
});

describe("erase", () => {
  it("needs the typed confirmation", async () => {
    await expect(eraseData(db, "history", "oui")).rejects.toThrow("confirmation");
    expect((await db.select({ n: count() }).from(workoutSessions))[0]!.n).toBe(1);
  });

  it("history: removes workouts and sets, keeps the program", async () => {
    await eraseData(db, "history", "effacer");
    expect((await db.select({ n: count() }).from(workoutSessions))[0]!.n).toBe(0);
    expect((await db.select({ n: count() }).from(setLogs))[0]!.n).toBe(0);
    expect((await db.select({ n: count() }).from(trainingPrograms))[0]!.n).toBe(1);
  });

  it("everything: removes programs too, keeps the account and settings", async () => {
    await eraseData(db, "everything", "EFFACER");
    expect((await db.select({ n: count() }).from(trainingPrograms))[0]!.n).toBe(0);
    expect((await db.select({ n: count() }).from(ownerAccount))[0]!.n).toBe(1);
    expect((await getOwnerSettings(db, ownerId)).displayName).toBe("Alex");
  });
});
