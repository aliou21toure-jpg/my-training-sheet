import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerAccount, personalSettings, plannedSessions, workoutSessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { getCalendar } from "@/features/calendar/get-calendar";
import { workbookFingerprint } from "@/features/import/fingerprint";
import { parseWorkbook } from "@/features/import/parse-workbook";
import { saveProgramDraft } from "@/features/import/save-program";
import { loadActiveProgram } from "@/features/program/load-program";
import { ScheduleError, chooseOption, resolveRange, swapDays, weekdayOf } from "@/features/schedule/schedule";
import { getTodayView } from "@/features/today/get-today";
import { getSession, startWorkout } from "@/features/workouts/session";
import { buildSampleWorkbook, buildWorkbook, sampleSheets } from "../../fixtures/sample-workbook";
import { createTestDb } from "../db/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let ownerId: string;
const TZ = "Europe/Paris";
// Sunday 1 Nov 2026, 10:00 Paris. The week ahead: Mon 2 … Sat 7.
const NOW = new Date("2026-11-01T09:00:00Z");
const TODAY = "2026-11-01";

async function importProgram(bytes: Uint8Array, name: string) {
  const parsed = await parseWorkbook(bytes);
  if (!parsed.ok) throw new Error(parsed.error.message);
  await saveProgramDraft(db, { program: parsed.program, issues: parsed.issues, fileName: name, fileSize: bytes.byteLength, fileSha256: workbookFingerprint(bytes) });
}

async function expectScheduleError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(ScheduleError);
  await p.catch((e: ScheduleError) => expect(e.code).toBe(code));
}

const kinds = async (dates: string[]) => {
  const r = await resolveRange(db, await loadActiveProgram(db), dates);
  return dates.map((d) => r.get(d)!.day?.kind ?? null);
};

beforeAll(async () => {
  t = await createTestDb();
  db = t.db as unknown as Db;
  const [o] = await db.insert(ownerAccount).values({ email: "o@example.test", passwordHash: "x" }).returning();
  ownerId = o!.id;
  await db.insert(personalSettings).values({ ownerId, timezone: TZ });
  await importProgram(await buildSampleWorkbook(), "p.xlsx");
}, 30_000);
afterAll(async () => {
  await t?.close();
});

describe("schedule", () => {
  it("gives each date its weekday's program day by default", async () => {
    expect(weekdayOf("2026-11-01")).toBe(7);
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(await kinds(["2026-11-02", "2026-11-04", "2026-11-07", "2026-11-08"])).toEqual(["strength", "recovery", "choice", "rest"]);
  });

  it("swaps two future days, and swapping back removes the exceptions", async () => {
    const program = await loadActiveProgram(db);
    await swapDays(db, program, "2026-11-04", "2026-11-05", TODAY, TZ); // Wed recovery ↔ Thu strength
    expect(await kinds(["2026-11-04", "2026-11-05"])).toEqual(["strength", "recovery"]);
    const moved = (await resolveRange(db, program, ["2026-11-04"])).get("2026-11-04")!;
    expect(moved).toMatchObject({ movedFrom: "2026-11-05" });
    expect(moved.day!.weekday).toBe(4);

    await swapDays(db, program, "2026-11-04", "2026-11-05", TODAY, TZ);
    expect(await kinds(["2026-11-04", "2026-11-05"])).toEqual(["recovery", "strength"]);
    expect(await db.select().from(plannedSessions)).toHaveLength(0);
  });

  it("moving a workout onto Sunday makes the original day a rest day", async () => {
    const program = await loadActiveProgram(db);
    await swapDays(db, program, "2026-11-06", "2026-11-08", TODAY, TZ);
    expect(await kinds(["2026-11-06", "2026-11-08"])).toEqual(["rest", "strength"]);
    await swapDays(db, program, "2026-11-06", "2026-11-08", TODAY, TZ);
  });

  it("refuses past dates, far dates, the same day and days already trained", async () => {
    const program = await loadActiveProgram(db);
    await expectScheduleError(swapDays(db, program, "2026-10-30", "2026-11-02", TODAY, TZ), "past");
    await expectScheduleError(swapDays(db, program, "2026-11-02", "2027-03-01", TODAY, TZ), "too_far");
    await expectScheduleError(swapDays(db, program, "2026-11-02", "2026-11-02", TODAY, TZ), "same_day");
    await db.insert(workoutSessions).values({
      planSnapshot: {},
      idempotencyKey: randomUUID(),
      status: "completed",
      startedAt: new Date("2026-11-01T08:00:00Z"),
      endedAt: new Date("2026-11-01T08:30:00Z"),
    });
    await expectScheduleError(swapDays(db, program, TODAY, "2026-11-02", TODAY, TZ), "done");
  });

  it("chooses the Saturday option in advance; only on choice days", async () => {
    const program = await loadActiveProgram(db);
    await chooseOption(db, program, "2026-11-07", 3, TODAY);
    expect((await resolveRange(db, program, ["2026-11-07"])).get("2026-11-07")!.optionNumber).toBe(3);
    await expectScheduleError(chooseOption(db, program, "2026-11-02", 1, TODAY), "not_choice");
    await expectScheduleError(chooseOption(db, program, "2026-11-07", 9, TODAY), "unknown_option");
  });

  it("starting on that Saturday uses the chosen option", async () => {
    const { sessionId } = await startWorkout(db, { date: "2026-11-07", idempotencyKey: randomUUID() });
    const s = await getSession(db, sessionId);
    expect(s!.snapshot).toMatchObject({ variantNumber: 3, title: "Option 3 · Conditioning" });
    await db.update(workoutSessions).set({ status: "abandoned", endedAt: new Date() }).where(eq(workoutSessions.id, sessionId));
  });

  it("a choice made before a new import still applies to the new version", async () => {
    const edited = structuredClone(sampleSheets);
    edited.Tue!.rows.push(["Dips", "3 x 10", "90 s"]);
    await importProgram(await buildWorkbook(edited), "v2.xlsx");
    const program = await loadActiveProgram(db);
    expect(program!.version).toBe(2);
    const sat = (await resolveRange(db, program, ["2026-11-07"])).get("2026-11-07")!;
    expect(sat.optionNumber).toBe(3);
    expect(sat.day!.id).toBe(program!.days.find((d) => d.weekday === 6)!.id); // the NEW version's Saturday
  });
});

describe("calendar view", () => {
  it("builds a Monday–Sunday week with statuses", async () => {
    const cal = await getCalendar(db, ownerId, NOW, "week", "2026-11-03");
    expect(cal.days.map((d) => d.isoDate)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(cal.days.map((d) => d.status)).toEqual(["planned", "planned", "recovery", "planned", "planned", "planned", "rest"]);
    expect(cal.days[5]).toMatchObject({ title: "Option 3 · Conditioning", selectedOption: 3, editable: true });
    expect(cal.prev).toBe("2026-10-27");
  });

  it("builds a full month grid starting on Monday and marks done / past days", async () => {
    const cal = await getCalendar(db, ownerId, NOW, "month", "2026-11-15");
    expect(cal.days[0]!.isoDate).toBe("2026-10-26");
    expect(cal.days.length % 7).toBe(0);
    expect(cal.days.at(-1)!.isoDate).toBe("2026-12-06");
    const today = cal.days.find((d) => d.isToday)!;
    expect(today).toMatchObject({ isoDate: TODAY, status: "done", editable: false });
    expect(cal.days.find((d) => d.isoDate === "2026-10-27")).toMatchObject({ status: "missed", editable: false, inMonth: false });
  });

  it("Today shows the option chosen in the calendar", async () => {
    const view = await getTodayView(db, ownerId, new Date("2026-11-07T09:00:00Z"));
    expect(view.todayOption).toBe(3);
  });
});
