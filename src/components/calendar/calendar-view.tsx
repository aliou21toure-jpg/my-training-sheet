"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { chooseOptionAction, swapDaysAction } from "@/app/(app)/calendar/actions";
import type { CalendarData, CalendarDay, CalendarStatus } from "@/features/calendar/get-calendar";
import { BlockSummary } from "@/components/today/plan-parts";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const STATUS: Record<CalendarStatus, { label: string; className: string }> = {
  done: { label: "Faite", className: "bg-accent text-on-accent" },
  today: { label: "Aujourd’hui", className: "bg-accent-soft text-accent ring-2 ring-accent ring-inset" },
  planned: { label: "Prévue", className: "text-accent ring-[1.5px] ring-accent ring-inset" },
  missed: { label: "Non faite", className: "bg-fill text-text-muted" },
  recovery: { label: "Récupération", className: "bg-accent-soft text-accent" },
  rest: { label: "Repos", className: "bg-fill text-text-muted" },
  none: { label: "", className: "text-text-muted" },
};

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function CalendarView({ data }: { data: CalendarData }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(() => data.days.find((d) => d.isToday)?.isoDate ?? data.days.find((d) => d.inMonth)!.isoDate);
  const [moving, setMoving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedDay = data.days.find((d) => d.isoDate === selected) ?? null;

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.ok) setMessage(result.message ?? "Action impossible.");
      setMoving(null);
      router.refresh();
    });

  const href = (view: string, d: string) => `/calendar?view=${view}&d=${d}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-4xl lg:px-10 lg:pt-12">
      <header className="flex items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">Calendrier</h1>
          <p className="text-[15px] capitalize text-text-muted">{data.label}</p>
        </div>
        <div role="radiogroup" aria-label="Vue" className="grid grid-cols-2 gap-0.5 rounded-xl bg-fill p-0.5">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              role="radio"
              aria-checked={data.view === v}
              href={href(v, data.anchor)}
              className={`flex h-9 items-center justify-center rounded-[10px] px-3 text-[14px] font-semibold ${data.view === v ? "bg-card text-text shadow-sm" : "text-text-muted"}`}
            >
              {v === "week" ? "Semaine" : "Mois"}
            </Link>
          ))}
        </div>
      </header>

      <nav aria-label="Période" className="flex items-center justify-between">
        <Link href={href(data.view, data.prev)} aria-label="Période précédente" className="flex size-11 items-center justify-center rounded-full bg-card">
          <ChevronLeft aria-hidden size={20} />
        </Link>
        <Link href={href(data.view, data.today)} className="min-h-11 px-3 py-2.5 text-[15px] font-semibold text-accent">
          Aujourd’hui
        </Link>
        <Link href={href(data.view, data.next)} aria-label="Période suivante" className="flex size-11 items-center justify-center rounded-full bg-card">
          <ChevronRight aria-hidden size={20} />
        </Link>
      </nav>

      {!data.hasProgram && (
        <p className="rounded-[18px] bg-card p-4 text-[15px] text-text-muted">
          Importe ton programme pour voir ton planning. <Link href="/settings/import" className="font-semibold text-accent">Importer</Link>
        </p>
      )}

      {moving && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-[18px] bg-accent-soft p-3 text-[15px] text-accent">
          <span>Choisis le jour avec lequel échanger <strong>{longDate(moving)}</strong>.</span>
          <button type="button" onClick={() => setMoving(null)} className="min-h-11 font-semibold">Annuler</button>
        </p>
      )}
      {message && <p role="alert" className="rounded-[18px] bg-warn-soft p-3 text-[15px] text-warn">{message}</p>}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {data.view === "month" ? (
          <MonthGrid data={data} selected={selected} moving={moving} onPick={(d) => (moving ? onPickTarget(d) : setSelected(d.isoDate))} />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.days.map((d) => (
              <li key={d.isoDate}>
                <button
                  type="button"
                  onClick={() => (moving ? onPickTarget(d) : setSelected(d.isoDate))}
                  disabled={!!moving && (!d.editable || d.isoDate === moving)}
                  aria-current={d.isToday ? "date" : undefined}
                  aria-pressed={selected === d.isoDate}
                  className={`flex w-full items-center gap-3 rounded-[18px] bg-card px-3 py-3 text-left transition disabled:opacity-40 ${selected === d.isoDate && !moving ? "ring-2 ring-accent" : ""}`}
                >
                  <span className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl ${STATUS[d.status].className}`}>
                    <span className="text-[10px] font-semibold uppercase">{WEEKDAYS[d.weekday - 1]}</span>
                    <span className="text-[17px] font-bold leading-[18px]">{d.dayOfMonth}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{d.sessions[0]?.title ?? d.title}</span>
                    <span className="block truncate text-[13px] text-text-muted">
                      {[STATUS[d.status].label, d.movedFrom ? "déplacée" : null, d.subtitle].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedDay && !moving && (
          <DayDetail
            day={selectedDay}
            today={data.today}
            pending={pending}
            onMove={() => setMoving(selectedDay.isoDate)}
            onChoose={(n) => act(() => chooseOptionAction(selectedDay.isoDate, n))}
          />
        )}
      </div>
      {pending && <LoaderCircle aria-label="Mise à jour" className="mx-auto animate-spin text-accent" />}
    </main>
  );

  function onPickTarget(d: CalendarDay) {
    if (!moving || !d.editable || d.isoDate === moving) return;
    const from = moving;
    act(() => swapDaysAction(from, d.isoDate));
    setSelected(d.isoDate);
  }
}

function MonthGrid({ data, selected, moving, onPick }: { data: CalendarData; selected: string; moving: string | null; onPick: (d: CalendarDay) => void }) {
  return (
    <section aria-label="Mois" className="rounded-[20px] bg-card p-3">
      <div aria-hidden className="grid grid-cols-7 pb-2 text-center text-[12px] font-semibold text-text-muted">
        {WEEKDAYS.map((w) => <span key={w}>{w.slice(0, 1)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {data.days.map((d) => (
          <button
            key={d.isoDate}
            type="button"
            onClick={() => onPick(d)}
            disabled={!!moving && (!d.editable || d.isoDate === moving)}
            aria-label={`${longDate(d.isoDate)} : ${STATUS[d.status].label || "rien de prévu"}`}
            aria-pressed={selected === d.isoDate}
            className={`flex aspect-square items-center justify-center rounded-full text-[15px] font-semibold tabular-nums disabled:opacity-30 ${d.inMonth ? "" : "opacity-35"} ${STATUS[d.status].className} ${selected === d.isoDate && !moving ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}
          >
            {d.dayOfMonth}
          </button>
        ))}
      </div>
    </section>
  );
}

function DayDetail({ day, today, pending, onMove, onChoose }: { day: CalendarDay; today: string; pending: boolean; onMove: () => void; onChoose: (n: number | null) => void }) {
  return (
    <section aria-label={`Détail du ${longDate(day.isoDate)}`} className="flex flex-col gap-3 rounded-[22px] bg-card p-4">
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{longDate(day.isoDate)}</p>
        <h2 className="text-[22px] font-bold tracking-tight">{day.title}</h2>
        {day.movedFrom && <p className="text-[13px] text-text-muted">Déplacée depuis le {longDate(day.movedFrom)}</p>}
      </div>

      {day.sessions.map((s) => (
        <Link key={s.id} href={s.status === "completed" ? `/workout/${s.id}/summary` : "/workout"} className="flex min-h-11 items-center gap-2 rounded-xl bg-accent-soft px-3 text-[15px] font-semibold text-accent">
          <CheckCircle2 aria-hidden size={18} /> {s.status === "completed" ? "Voir la séance faite" : "Séance en cours"}
        </Link>
      ))}

      {day.options.length > 0 && day.sessions.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-text-muted">{day.editable ? "Choisis ton option à l’avance (modifiable jusqu’au jour J)." : "Options du jour"}</p>
          <div role="radiogroup" aria-label="Option" className="grid gap-0.5 rounded-xl bg-fill p-0.5" style={{ gridTemplateColumns: `repeat(${day.options.length}, minmax(0, 1fr))` }}>
            {day.options.map((o) => (
              <button
                key={o.number}
                type="button"
                role="radio"
                aria-checked={day.selectedOption === o.number}
                disabled={!day.editable || pending}
                onClick={() => onChoose(day.selectedOption === o.number ? null : o.number)}
                className={`h-10 truncate rounded-[10px] px-2 text-[14px] font-semibold ${day.selectedOption === o.number ? "bg-card text-text shadow-sm" : "text-text-muted"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {day.blocks.length > 0 && day.sessions.length === 0 && <BlockSummary blocks={day.blocks} />}

      {day.editable && (
        <button type="button" onClick={onMove} disabled={pending} className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-fill text-[15px] font-semibold">
          <ArrowLeftRight aria-hidden size={18} /> Déplacer (échanger avec un autre jour)
        </button>
      )}
      {!day.editable && day.isoDate < today && day.sessions.length === 0 && (
        <p className="text-[13px] text-text-muted">Jour passé : l’historique ne se modifie pas.</p>
      )}
    </section>
  );
}
