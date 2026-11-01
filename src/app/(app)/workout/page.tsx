import { randomUUID } from "node:crypto";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TodayCard } from "@/components/today/today-card";
import { WorkoutScreen } from "@/components/workout/workout-screen";
import { getDb } from "@/db/client";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { getTodayView } from "@/features/today/get-today";
import { getActiveSessionId, getPreviousPerformance, getSession } from "@/features/workouts/session";
import { requireOwner } from "@/lib/auth/current-owner";

const ERRORS: Record<string, string> = {
  rest_day: "Pas de séance prévue aujourd’hui.",
  no_program: "Importe d’abord ton programme.",
};

export default function WorkoutPage({ searchParams }: PageProps<"/workout">) {
  return (
    <Suspense fallback={<main aria-busy="true" className="mx-auto w-full max-w-xl px-4 pt-14"><div className="h-96 animate-pulse rounded-[24px] bg-card" /></main>}>
      <Workout searchParams={searchParams} />
    </Suspense>
  );
}

async function Workout({ searchParams }: Pick<PageProps<"/workout">, "searchParams">) {
  await connection();
  const owner = await requireOwner();
  const db = getDb();

  const activeId = await getActiveSessionId(db);
  const session = activeId ? await getSession(db, activeId) : null;
  if (session) {
    const ids = [...new Set(session.snapshot.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)))];
    const previous = Object.fromEntries(await getPreviousPerformance(db, ids, session.id));
    const { unit } = await getOwnerSettings(db, owner.id);
    return <WorkoutScreen session={session} previous={previous} unit={unit} />;
  }

  // No workout in progress: show today's plan with its start button.
  const error = (await searchParams).error;
  const view = await getTodayView(db, owner.id, new Date());
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-2xl lg:px-10 lg:pt-12">
      <h1 className="px-1 text-[32px] font-bold leading-tight tracking-tight">Séance</h1>
      {typeof error === "string" && ERRORS[error] && (
        <p role="alert" className="rounded-[18px] bg-warn-soft p-4 text-[15px] text-warn">{ERRORS[error]}</p>
      )}
      <TodayCard view={view} startKey={randomUUID()} />
      <Link href="/" className="px-1 text-[15px] font-semibold text-accent">Voir la semaine</Link>
    </main>
  );
}
