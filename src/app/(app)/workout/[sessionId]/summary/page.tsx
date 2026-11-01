import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2, Trophy } from "lucide-react";
import { getDb } from "@/db/client";
import { BLOCK_KIND_LABELS } from "@/features/import/format";
import { formatClock, formatLogged } from "@/features/workouts/set-values";
import { getPersonalBests, getSession } from "@/features/workouts/session";
import { findNewRecords, summarizeSession, type NewRecord } from "@/features/workouts/summary";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { requireOwner } from "@/lib/auth/current-owner";
import { formatWeight, type WeightUnit } from "@/lib/units";

export default function SummaryPage({ params }: PageProps<"/workout/[sessionId]/summary">) {
  return (
    <Suspense fallback={<main aria-busy="true" className="mx-auto w-full max-w-md px-4 pt-14"><div className="h-80 animate-pulse rounded-[24px] bg-card" /></main>}>
      <Summary params={params} />
    </Suspense>
  );
}

function recordText(r: NewRecord, unit: WeightUnit) {
  if (r.kind === "weight") return `${formatWeight(r.value, unit)} (avant : ${formatWeight(r.previous, unit)})`;
  if (r.kind === "reps") return `${r.value} reps (avant : ${r.previous})`;
  return `${r.value} s (avant : ${r.previous} s)`;
}

async function Summary({ params }: Pick<PageProps<"/workout/[sessionId]/summary">, "params">) {
  await connection();
  const owner = await requireOwner();
  const db = getDb();
  const { unit } = await getOwnerSettings(db, owner.id);
  const { sessionId } = await params;
  const session = await getSession(db, sessionId);
  if (!session) notFound();
  if (session.status !== "completed") redirect("/workout");

  const summary = summarizeSession(session.snapshot, session.logs, session.activeSeconds);
  const bests = await getPersonalBests(db, [...new Set(session.logs.map((l) => l.exerciseId))], session.id);
  const records = findNewRecords(session.snapshot, session.logs, bests);

  const stats = [
    { label: "Durée", value: formatClock(summary.activeSeconds) },
    { label: "Séries validées", value: String(summary.completedSets) },
    { label: "Exercices", value: `${summary.exercisesDone}` },
    { label: "Volume", value: summary.volumeKg === null ? "—" : formatWeight(Math.round(summary.volumeKg), unit) },
  ];

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-2xl lg:px-10 lg:pt-12">
      <section className="flex flex-col items-center gap-2 py-4 text-center motion-safe:animate-[fade-in_400ms_ease-out]">
        <CheckCircle2 aria-hidden size={56} strokeWidth={1.6} className="text-positive" />
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">Séance terminée</h1>
        <p className="text-[15px] text-text-muted">{session.snapshot.title}</p>
      </section>

      <section aria-label="Résumé" className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] bg-card p-4">
            <p className="text-[13px] text-text-muted">{s.label}</p>
            <p className="text-[26px] font-bold tabular-nums tracking-tight">{s.value}</p>
          </div>
        ))}
      </section>
      {summary.volumeKg !== null && summary.setsWithoutWeight > 0 && (
        <p className="-mt-2 px-1 text-[13px] text-text-muted">
          Volume = charge × reps des séries avec un poids. {summary.setsWithoutWeight} série{summary.setsWithoutWeight > 1 ? "s" : ""} sans poids (poids du corps ou durée) non comptée{summary.setsWithoutWeight > 1 ? "s" : ""}.
        </p>
      )}

      {records.length > 0 && (
        <section aria-label="Nouveaux records" className="flex flex-col gap-2 rounded-[20px] bg-accent-soft p-4 text-accent">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold"><Trophy aria-hidden size={20} /> Nouveaux records</h2>
          <ul className="flex flex-col gap-1 text-[15px]">
            {records.map((r) => (
              <li key={r.exerciseId}><span className="font-semibold">{r.name}</span> · {recordText(r, unit)}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Détail" className="flex flex-col gap-2">
        <h2 className="px-1 text-[20px] font-bold tracking-tight">Détail</h2>
        <ul className="overflow-hidden rounded-[20px] bg-card">
          {session.snapshot.blocks.flatMap((block) =>
            block.exercises.map((e) => {
              const sets = session.logs.filter((l) => l.snapshotKey === e.key && l.completed);
              return (
                <li key={e.key} className="flex items-start justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold">{e.name}</p>
                    <p className="text-[13px] text-text-muted">{BLOCK_KIND_LABELS[block.kind]} · prévu {e.plannedLabel}</p>
                  </div>
                  <p className="shrink-0 text-right text-[14px] tabular-nums text-text-muted">
                    {sets.length ? sets.map((l) => formatLogged(l, e, unit)).join(" · ") : "non fait"}
                  </p>
                </li>
              );
            }),
          )}
        </ul>
      </section>

      {session.notes && (
        <section className="rounded-[20px] bg-card p-4">
          <h2 className="text-[15px] font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-line text-[15px] text-text-muted">{session.notes}</p>
        </section>
      )}

      <Link href="/" className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent">
        Retour à l’accueil
      </Link>
    </main>
  );
}
