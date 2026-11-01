/**
 * Fills an EMPTY database with synthetic demo data (fake program, fake
 * workouts) for screenshots and local demos. Never real personal data.
 *
 *   pnpm demo:seed -- --yes-this-is-a-demo-database
 *
 * Refuses to run if any workout already exists.
 */
import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/types";
import { hashPassword } from "../src/features/auth/password";
import { workbookFingerprint } from "../src/features/import/fingerprint";
import { parseWorkbook } from "../src/features/import/parse-workbook";
import { saveProgramDraft } from "../src/features/import/save-program";
import { loadActiveProgram } from "../src/features/program/load-program";
import { resolveRange } from "../src/features/schedule/schedule";
import { getSession, logSet, startWorkout } from "../src/features/workouts/session";
import { addDays, localDateInfo } from "../src/lib/dates/local-date";
import { buildSampleWorkbook } from "../tests/fixtures/sample-workbook";

const TZ = "Europe/Paris";

async function main() {
  if (!process.argv.includes("--yes-this-is-a-demo-database")) {
    throw new Error("Add --yes-this-is-a-demo-database: this script writes fake data.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Db;

  try {
    const [{ n }] = (await db.select({ n: count() }).from(schema.workoutSessions)) as [{ n: number }];
    if (n > 0) throw new Error("This database already has workouts: refusing to add demo data.");

    let [owner] = await db.select().from(schema.ownerAccount);
    if (!owner) {
      [owner] = await db.insert(schema.ownerAccount).values({ email: "demo@example.com", passwordHash: await hashPassword("demo-password-1234") }).returning();
      await db.insert(schema.personalSettings).values({ ownerId: owner!.id, displayName: "Alex", timezone: TZ });
      console.log("Demo owner: demo@example.com / demo-password-1234");
    }

    if (!(await loadActiveProgram(db))) {
      const bytes = await buildSampleWorkbook();
      const parsed = await parseWorkbook(bytes);
      if (!parsed.ok) throw new Error(parsed.error.message);
      await saveProgramDraft(db, { program: parsed.program, issues: parsed.issues, fileName: "sample-program.xlsx", fileSize: bytes.byteLength, fileSha256: workbookFingerprint(bytes) });
      await db.update(schema.trainingPrograms).set({ createdAt: new Date(Date.now() - 50 * 86_400_000) });
    }

    const program = (await loadActiveProgram(db))!;
    const today = localDateInfo(new Date(), TZ).isoDate;
    const dates = Array.from({ length: 49 }, (_, i) => addDays(today, i - 49));
    const schedule = await resolveRange(db, program, dates);

    let done = 0;
    for (const [i, date] of dates.entries()) {
      const day = schedule.get(date)!.day;
      if (!day || (day.kind !== "strength" && day.kind !== "choice")) continue;
      if ((i * 7) % 10 === 3) continue; // a few missed days, like real life
      const progress = i / dates.length;
      const { sessionId } = await startWorkout(db, { date, option: day.kind === "choice" ? 1 + (i % 3) : undefined, idempotencyKey: randomUUID() });
      const session = (await getSession(db, sessionId))!;
      for (const block of session.snapshot.blocks) {
        if (block.optional && i % 2 === 0) continue;
        // Only loaded exercises get a weight; circuits and abs stay bodyweight.
        const loaded = block.kind === "strength" || block.kind === "circuit";
        for (const ex of block.exercises) {
          const base = 12 + ([...ex.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 5) * 7;
          for (let s = 1; s <= ex.plannedSets; s++) {
            const isTimed = ex.input === "duration";
            await logSet(db, {
              sessionId,
              snapshotKey: ex.key,
              setNumber: s,
              weightKg: isTimed || !loaded ? null : Math.round((base + progress * 8 + (s === ex.plannedSets ? 2.5 : 0)) * 2) / 2,
              reps: isTimed ? null : (ex.targetRepsMax ?? 10) - (s > 1 ? 1 : 0),
              durationSeconds: isTimed ? Math.round((ex.targetSeconds ?? (ex.durationUnit === "min" ? 900 : 30)) * (0.9 + progress * 0.4)) : null,
              completed: true,
            });
          }
        }
      }
      const start = new Date(`${date}T17:${String(10 + (i % 40)).padStart(2, "0")}:00Z`);
      await db
        .update(schema.workoutSessions)
        .set({ status: "completed", startedAt: start, endedAt: new Date(start.getTime() + (50 + (i % 20)) * 60_000), notes: i % 5 === 0 ? "Bonne énergie aujourd’hui." : null })
        .where(eq(schema.workoutSessions.id, sessionId));
      done++;
    }
    console.log(`Demo data: ${done} synthetic workouts over 7 weeks.`);
  } finally {
    await client.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
