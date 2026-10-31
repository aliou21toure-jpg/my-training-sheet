"use client";

import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { formatSeconds } from "@/features/import/format";
import type { SnapshotExercise } from "@/features/workouts/snapshot";
import { describePrevious, formatLogged, type SetDraft } from "@/features/workouts/set-values";
import type { LoggedSet } from "@/features/workouts/summary";

export type Field = "weight" | "reps" | "duration";

interface Props {
  exercise: SnapshotExercise;
  rowLabel: string;
  drafts: SetDraft[];
  previous: LoggedSet[] | undefined;
  invalid: Set<string>;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onChange: (setNumber: number, field: Field, value: string) => void;
  onCommit: (setNumber: number) => void;
  onCheck: (setNumber: number) => void;
  onAdd: () => void;
  onRemove: () => void;
}

const inputClass =
  "h-11 w-full min-w-0 rounded-[10px] border-0 bg-bg text-center text-[17px] font-semibold tabular-nums text-text outline-none ring-accent placeholder:font-normal placeholder:text-text-muted/70 focus:ring-2 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-warn";

export function ExerciseCard(p: Props) {
  const { exercise: e } = p;
  const done = p.drafts.filter((d) => d.completed).length;
  const allDone = done === p.drafts.length && p.drafts.length > 0;
  const prevBySet = new Map(p.previous?.map((l) => [l.setNumber, l]));
  const previousLine = describePrevious(p.previous, e);
  const isDuration = e.input === "duration";
  const unit = e.durationUnit === "min" ? "min" : "s";
  const repsHint = e.targetRepsMin === null ? undefined : e.targetRepsMin === e.targetRepsMax ? String(e.targetRepsMin) : `${e.targetRepsMin}–${e.targetRepsMax}`;
  const durationHint = e.targetSeconds === null ? undefined : String(e.durationUnit === "min" ? Math.round(e.targetSeconds / 60) : e.targetSeconds);
  const cols = isDuration ? "grid-cols-[34px_minmax(0,1fr)_96px_48px]" : "grid-cols-[34px_minmax(0,1fr)_72px_64px_48px]";

  return (
    <article className="overflow-hidden rounded-[20px] bg-card" aria-label={e.name}>
      <button
        type="button"
        onClick={p.onToggle}
        aria-expanded={p.open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          aria-hidden
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
            allDone ? "bg-accent text-on-accent" : done > 0 ? "bg-accent-soft text-accent" : "text-text-muted ring-[1.5px] ring-line ring-inset"
          }`}
        >
          {allDone ? <Check size={15} strokeWidth={3} /> : `${done}/${p.drafts.length}`}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[17px] font-semibold leading-snug ${allDone && !p.open ? "text-text-muted" : ""}`}>{e.name}</span>
          <span className="block text-[13px] text-text-muted">{e.plannedLabel}{e.restSeconds ? ` · repos ${formatSeconds(e.restSeconds)}` : ""}</span>
        </span>
        <ChevronDown aria-hidden size={20} className={`shrink-0 text-text-muted transition-transform ${p.open ? "rotate-180" : ""}`} />
      </button>

      {p.open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {(e.note || e.alternatives.length > 0 || previousLine) && (
            <div className="flex flex-col gap-1 px-1 text-[13px] text-text-muted">
              {e.note && <p>{e.note}</p>}
              {e.alternatives.length > 0 && <p>Au choix : {e.alternatives.join(" ou ")}</p>}
              {previousLine && <p>Dernière fois : {previousLine}</p>}
            </div>
          )}

          <div role="table" aria-label={`Séries — ${e.name}`} className="flex flex-col gap-1">
            <div role="row" className={`grid ${cols} items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted`}>
              <span role="columnheader" className="text-center">{p.rowLabel}</span>
              <span role="columnheader">Précédent</span>
              {isDuration ? (
                <span role="columnheader" className="text-center">Durée ({unit})</span>
              ) : (
                <>
                  <span role="columnheader" className="text-center">kg</span>
                  <span role="columnheader" className="text-center">Reps</span>
                </>
              )}
              <span role="columnheader" className="text-center"><span className="sr-only">Validée</span>✓</span>
            </div>

            {p.drafts.map((d) => {
              const prev = prevBySet.get(d.setNumber);
              const id = `${e.key}-${d.setNumber}`;
              const bad = (f: Field) => p.invalid.has(`${e.key}#${d.setNumber}#${f}`);
              return (
                <div
                  role="row"
                  key={d.setNumber}
                  className={`grid ${cols} items-center gap-2 rounded-xl px-1 py-1 transition-colors ${d.completed ? "bg-accent-soft" : ""}`}
                >
                  <span role="cell" className={`text-center text-[16px] font-bold ${d.completed ? "text-accent" : ""}`}>{d.setNumber}</span>
                  <span role="cell" className="truncate text-[14px] tabular-nums text-text-muted">{formatLogged(prev, e)}</span>
                  {isDuration ? (
                    <span role="cell">
                      <input
                        id={`${id}-duration`}
                        aria-label={`${p.rowLabel} ${d.setNumber}, durée en ${unit === "s" ? "secondes" : "minutes"}`}
                        aria-invalid={bad("duration")}
                        inputMode="decimal"
                        enterKeyHint="done"
                        disabled={p.disabled}
                        value={d.duration}
                        placeholder={prev?.durationSeconds != null ? formatLogged(prev, e).split(" ")[0] : durationHint}
                        onChange={(ev) => p.onChange(d.setNumber, "duration", ev.target.value)}
                        onBlur={() => p.onCommit(d.setNumber)}
                        className={inputClass}
                      />
                    </span>
                  ) : (
                    <>
                      <span role="cell">
                        <input
                          id={`${id}-weight`}
                          aria-label={`${p.rowLabel} ${d.setNumber}, poids en kg`}
                          aria-invalid={bad("weight")}
                          inputMode="decimal"
                          enterKeyHint="next"
                          disabled={p.disabled}
                          value={d.weight}
                          placeholder={prev?.weightKg != null ? String(prev.weightKg).replace(".", ",") : "—"}
                          onChange={(ev) => p.onChange(d.setNumber, "weight", ev.target.value)}
                          onBlur={() => p.onCommit(d.setNumber)}
                          className={inputClass}
                        />
                      </span>
                      <span role="cell">
                        <input
                          id={`${id}-reps`}
                          aria-label={`${p.rowLabel} ${d.setNumber}, répétitions`}
                          aria-invalid={bad("reps")}
                          inputMode="numeric"
                          enterKeyHint="done"
                          disabled={p.disabled}
                          value={d.reps}
                          placeholder={prev?.reps != null ? String(prev.reps) : repsHint}
                          onChange={(ev) => p.onChange(d.setNumber, "reps", ev.target.value)}
                          onBlur={() => p.onCommit(d.setNumber)}
                          className={inputClass}
                        />
                      </span>
                    </>
                  )}
                  <span role="cell" className="flex justify-center">
                    <button
                      type="button"
                      disabled={p.disabled}
                      aria-pressed={d.completed}
                      aria-label={`Valider ${p.rowLabel.toLowerCase()} ${d.setNumber}`}
                      onClick={() => p.onCheck(d.setNumber)}
                      className={`flex size-11 items-center justify-center rounded-xl transition-[transform,background-color] active:scale-90 ${
                        d.completed ? "bg-accent text-on-accent" : "bg-fill text-text-muted"
                      }`}
                    >
                      <Check aria-hidden size={20} strokeWidth={2.6} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-1">
            <button type="button" onClick={p.onAdd} disabled={p.disabled || p.drafts.length >= 30} className="flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-accent disabled:opacity-40">
              <Plus aria-hidden size={18} /> Ajouter
            </button>
            <button type="button" onClick={p.onRemove} disabled={p.disabled || p.drafts.length <= 1} className="flex min-h-11 items-center gap-1.5 text-[15px] text-text-muted disabled:opacity-40">
              <Minus aria-hidden size={18} /> Retirer la dernière
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
