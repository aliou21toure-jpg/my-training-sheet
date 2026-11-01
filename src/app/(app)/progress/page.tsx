import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChartNoAxesColumnIncreasing, Medal, Trophy } from "lucide-react";
import { ExercisePicker } from "@/components/progress/exercise-picker";
import { ExerciseChart, WeeklyChart, metricUnit } from "@/components/progress/progress-charts";
import { getDb } from "@/db/client";
import { getProgress, valueOf, type Achievement, type Metric, type ProgressRange } from "@/features/progress/get-progress";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { requireOwner } from "@/lib/auth/current-owner";
import { toDisplayWeight, type WeightUnit } from "@/lib/units";

const RANGES: { value: ProgressRange; label: string }[] = [
  { value: "8w", label: "8 semaines" },
  { value: "6m", label: "6 mois" },
  { value: "all", label: "Tout" },
];

const fr = (n: number) => String(n).replace(".", ",");
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function formatValue(metric: Metric, value: number, unit: WeightUnit) {
  return `${fr(metric === "weight" ? toDisplayWeight(value, unit) : value)} ${metricUnit(metric, unit)}`;
}

function achievementText(a: Achievement, unit: WeightUnit) {
  if (a.kind === "milestone" || a.value === undefined || !a.metric) return a.text;
  return `${a.text} : ${formatValue(a.metric, a.value, unit)} (avant ${formatValue(a.metric, a.previous!, unit)})`;
}

export default function ProgressPage({ searchParams }: PageProps<"/progress">) {
  return (
    <Suspense fallback={<main aria-busy="true" className="mx-auto w-full max-w-md px-4 pt-14"><div className="h-[560px] animate-pulse rounded-[22px] bg-card" /></main>}>
      <Progress searchParams={searchParams} />
    </Suspense>
  );
}

async function Progress({ searchParams }: Pick<PageProps<"/progress">, "searchParams">) {
  await connection();
  const owner = await requireOwner();
  const params = await searchParams;
  const range: ProgressRange = params.range === "6m" || params.range === "all" ? params.range : "8w";
  const db = getDb();
  const [data, settings] = await Promise.all([
    getProgress(db, owner.id, new Date(), range, typeof params.exercise === "string" ? params.exercise : null),
    getOwnerSettings(db, owner.id),
  ]);
  const unit = settings.unit;
  const sel = data.selected;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-5xl lg:px-10 lg:pt-12">
      <h1 className="px-1 text-[32px] font-bold leading-tight tracking-tight">Progrès</h1>

      <nav role="radiogroup" aria-label="Période" className="grid grid-cols-3 gap-0.5 rounded-xl bg-fill p-0.5 lg:max-w-md">
        {RANGES.map((r) => (
          <Link
            key={r.value}
            role="radio"
            aria-checked={range === r.value}
            href={`/progress?range=${r.value}${sel ? `&exercise=${sel.id}` : ""}`}
            scroll={false}
            className={`flex h-10 items-center justify-center rounded-[10px] text-[14px] font-semibold ${range === r.value ? "bg-card text-text shadow-sm" : "text-text-muted"}`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {data.completedAllTime === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-[24px] bg-card px-6 py-10 text-center">
          <ChartNoAxesColumnIncreasing aria-hidden size={36} strokeWidth={1.6} className="text-accent" />
          <h2 className="text-[20px] font-bold">Pas encore de séance terminée</h2>
          <p className="max-w-xs text-[15px] text-text-muted">Tes courbes apparaîtront après ta première séance. Rien n’est inventé : sans données, pas de graphique.</p>
          <Link href="/" className="text-[16px] font-semibold text-accent">Voir la séance du jour</Link>
        </section>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          <section aria-label="Résumé" className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
            <Stat label="Séances terminées" value={String(data.completedInRange)} hint={range === "all" ? "depuis le début" : `sur ${RANGES.find((r) => r.value === range)!.label}`} />
            <Stat
              label="Régularité"
              value={data.consistency === null ? "—" : `${Math.round(data.consistency * 100)} %`}
              hint={data.plannedInRange ? `${data.completedInRange} faites / ${data.plannedInRange} prévues` : "rien de prévu encore"}
            />
            <Stat label="Semaines actives" value={String(data.trainedWeeks)} hint="au moins une séance" />
            <Stat label="Au total" value={String(data.completedAllTime)} hint="séances enregistrées" />
          </section>

          {sel && (
            <section aria-label="Progression par exercice" className="flex flex-col gap-3 rounded-[22px] bg-card p-4">
              <ExercisePicker range={range} options={data.exercises.map((e) => ({ id: e.id, name: e.name }))} value={sel.id} />
              <div className="flex items-end justify-between gap-3 px-1">
                <p className="text-[13px] text-text-muted">
                  {sel.metric === "weight" ? "Charge max par séance" : sel.metric === "duration" ? "Durée max par séance" : "Reps max par séance (sans charge)"}
                </p>
                {sel.best !== null && (
                  <p className="text-right">
                    <span className="block text-[22px] font-bold tabular-nums">{formatValue(sel.metric, sel.best, unit)}</span>
                    <span className="text-[12px] text-text-muted">record · {shortDate(sel.bestDate!)}</span>
                  </p>
                )}
              </div>
              {sel.points.length >= 2 ? (
                <ExerciseChart points={sel.points} metric={sel.metric} unit={unit} name={sel.name} />
              ) : (
                <p className="rounded-xl bg-fill p-3 text-[14px] text-text-muted">
                  {sel.points.length === 1
                    ? `Une seule séance sur cette période (${formatValue(sel.metric, valueOf(sel.points[0]!, sel.metric) ?? 0, unit)}). La courbe apparaît dès la deuxième.`
                    : "Pas de séance de cet exercice sur cette période."}
                </p>
              )}
            </section>
          )}

          <section aria-label="Séances par semaine" className="flex flex-col gap-2 rounded-[22px] bg-card p-4">
            <h2 className="px-1 text-[17px] font-bold">Séances par semaine</h2>
            {data.weeks.length > 0 ? <WeeklyChart weeks={data.weeks} /> : <p className="text-[14px] text-text-muted">Aucune semaine à afficher.</p>}
          </section>

          <section aria-label="Records" className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 px-1 text-[20px] font-bold tracking-tight"><Trophy aria-hidden size={20} className="text-accent" /> Records</h2>
            <ul className="overflow-hidden rounded-[20px] bg-card">
              {data.exercises.filter((e) => e.best !== null).slice(0, 8).map((e, i) => (
                <li key={e.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                  <Link href={`/progress?range=${range}&exercise=${e.id}`} scroll={false} className="min-w-0">
                    <span className="block truncate text-[16px] font-semibold">{e.name}</span>
                    <span className="text-[13px] text-text-muted">{shortDate(e.bestDate!)} · {e.sessions} séance{e.sessions > 1 ? "s" : ""}</span>
                  </Link>
                  <span className="shrink-0 text-[16px] font-bold tabular-nums">{formatValue(e.metric, e.best!, unit)}</span>
                </li>
              ))}
            </ul>
          </section>

          {data.achievements.length > 0 && (
            <section aria-label="Réalisations récentes" className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 px-1 text-[20px] font-bold tracking-tight"><Medal aria-hidden size={20} className="text-accent" /> Réalisations récentes</h2>
              <ul className="overflow-hidden rounded-[20px] bg-card">
                {data.achievements.map((a, i) => (
                  <li key={`${a.date}-${a.text}-${i}`} className={`flex items-start gap-3 px-4 py-3 text-[15px] ${i ? "border-t border-line" : ""}`}>
                    <span className="w-14 shrink-0 text-[13px] text-text-muted">{shortDate(a.date)}</span>
                    <span>{achievementText(a, unit)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[18px] bg-card p-4">
      <p className="text-[13px] text-text-muted">{label}</p>
      <p className="text-[26px] font-bold tabular-nums tracking-tight">{value}</p>
      <p className="text-[12px] text-text-muted">{hint}</p>
    </div>
  );
}
