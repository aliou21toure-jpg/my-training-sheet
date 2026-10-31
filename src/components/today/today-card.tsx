import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, Footprints, Moon } from "lucide-react";
import type { TodayView } from "@/features/today/get-today";
import { ChoiceCard } from "./choice-card";
import { BlockSummary, StartLink, cardClass } from "./plan-parts";
import { StartButton } from "./start-button";

/** The big card: what today holds, depending on the kind of day. */
export function TodayCard({ view, startKey }: { view: TodayView; startKey: string }) {
  const day = view.today;
  const eyebrow = view.dateLabel.split(" ")[0]!.replace(/^./, (c) => c.toUpperCase());

  if (view.programVersion === null) {
    return (
      <section className={`${cardClass} items-center py-8 text-center`}>
        <FileSpreadsheet aria-hidden size={36} strokeWidth={1.6} className="text-accent" />
        <h2 className="text-[22px] font-bold tracking-tight">Pas encore de programme</h2>
        <p className="max-w-xs text-[15px] text-text-muted">Importe ton fichier Excel pour voir ta séance du jour ici.</p>
        <Link href="/settings/import" className="mt-1 text-[17px] font-semibold text-accent">
          Importer mon programme
        </Link>
      </section>
    );
  }

  if (view.activeSessionId) {
    return (
      <section className={cardClass}>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">Séance en cours</p>
        <h2 className="text-[24px] font-bold tracking-tight">Tu as une séance non terminée</h2>
        <p className="text-[15px] text-text-muted">Tes séries déjà saisies sont enregistrées.</p>
        <StartLink href="/workout" label="Reprendre la séance" />
      </section>
    );
  }

  if (view.doneToday) {
    return (
      <section className={`${cardClass} items-center py-8 text-center`}>
        <CheckCircle2 aria-hidden size={40} className="text-positive" />
        <h2 className="text-[22px] font-bold tracking-tight">Séance du jour terminée</h2>
        <p className="text-[15px] text-text-muted">Bravo. Le détail est dans Progrès.</p>
      </section>
    );
  }

  if (!day || day.kind === "rest") {
    return (
      <section className={`${cardClass} items-center py-8 text-center`}>
        <Moon aria-hidden size={36} strokeWidth={1.6} className="text-accent" />
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
        <h2 className="text-[24px] font-bold tracking-tight">Repos complet</h2>
        <p className="max-w-xs text-[15px] text-text-muted">Aucune séance prévue aujourd’hui. La récupération fait partie du programme.</p>
      </section>
    );
  }

  if (day.kind === "recovery") {
    const lines = day.variants.flatMap((v) => v.blocks.flatMap((b) => b.instructions));
    return (
      <section aria-label="Récupération du jour" className={cardClass}>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{eyebrow} · Récupération active</p>
          <h2 className="text-[24px] font-bold leading-[30px] tracking-tight">{day.focus ?? "Récupération"}</h2>
          {day.durationText && <p className="text-[15px] text-text-muted">{day.durationText}</p>}
        </div>
        {day.stepsTarget && (
          <div className="flex items-center gap-3 rounded-2xl bg-accent-soft p-4 text-accent">
            <Footprints aria-hidden size={24} />
            <div>
              <p className="text-[22px] font-bold tabular-nums">{day.stepsTarget.toLocaleString("fr-FR")} pas</p>
              <p className="text-[13px]">Objectif écrit dans ton programme</p>
            </div>
          </div>
        )}
        {lines.map((line) => (
          <p key={line} className="text-[15px] leading-snug text-text-muted">{line}</p>
        ))}
      </section>
    );
  }

  if (day.kind === "choice") return <ChoiceCard day={day} eyebrow={eyebrow} startKey={startKey} />;

  const main = day.variants[0];
  return (
    <section aria-label="Séance du jour" className={cardClass}>
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{eyebrow} · Séance du jour</p>
        <h2 className="text-[24px] font-bold leading-[30px] tracking-tight">{day.focus ?? day.title ?? "Séance"}</h2>
        {day.durationText && <p className="text-[15px] text-text-muted">Environ {day.durationText}</p>}
      </div>
      {main && <BlockSummary blocks={main.blocks} />}
      <StartButton startKey={startKey} />
    </section>
  );
}
