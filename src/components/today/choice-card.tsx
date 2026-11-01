"use client";

import { useState } from "react";
import type { PlannedDay } from "@/features/program/load-program";
import { BlockSummary, cardClass } from "./plan-parts";
import { StartButton } from "./start-button";

/** Saturday: one option among several. The choice is made here, then carried to the workout. */
export function ChoiceCard({ day, eyebrow, startKey, initialOption }: { day: PlannedDay; eyebrow: string; startKey: string; initialOption: number | null }) {
  // Starts on the option chosen in advance in the calendar, if any.
  const [selected, setSelected] = useState(initialOption ?? day.variants[0]?.number ?? 1);
  const variant = day.variants.find((v) => v.number === selected) ?? day.variants[0];
  const minutes = variant?.blocks.filter((b) => !b.optional && b.durationMinutes).reduce((n, b) => n + (b.durationMinutes ?? 0), 0);

  return (
    <section aria-label="Séance du jour" className={cardClass}>
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{eyebrow} · 1 option au choix</p>
        <h2 className="text-[24px] font-bold leading-[30px] tracking-tight">{variant?.label ?? "Séance libre"}</h2>
        <p className="text-[15px] text-text-muted">
          {minutes ? `${minutes} min d’après la feuille` : "Durée non précisée dans la feuille"}
        </p>
      </div>

      <div role="radiogroup" aria-label="Option du jour" className="grid gap-0.5 rounded-xl bg-fill p-0.5" style={{ gridTemplateColumns: `repeat(${day.variants.length}, minmax(0, 1fr))` }}>
        {day.variants.map((v) => {
          const checked = v.number === selected;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setSelected(v.number)}
              className={`h-10 truncate rounded-[10px] px-2 text-[14px] font-semibold transition-colors ${
                checked ? "bg-card text-text shadow-sm dark:bg-[#636366]" : "text-text-muted"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {variant && <BlockSummary blocks={variant.blocks} />}
      <StartButton startKey={startKey} option={selected} />
    </section>
  );
}
