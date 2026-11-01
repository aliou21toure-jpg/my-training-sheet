"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { saveProgramAction } from "@/app/(app)/settings/program/actions";
import { BLOCK_KIND_LABELS, formatPrescription, WEEKDAY_LABELS } from "@/features/import/format";
import type { BlockDraft, BlockKind, DayDraft, ExerciseDraft, ProgramDraft } from "@/features/import/types";

const SHORT = ["L", "M", "M", "J", "V", "S", "D"];
const input = "h-11 w-full min-w-0 rounded-xl border-0 bg-fill px-3 text-[16px] text-text outline-none ring-accent focus:ring-2";
const small = "h-11 w-full min-w-0 rounded-xl border-0 bg-fill px-2 text-center text-[16px] tabular-nums text-text outline-none ring-accent focus:ring-2";

function newExercise(position: number): ExerciseDraft {
  return {
    position,
    rawName: "",
    name: "",
    note: null,
    alternatives: [],
    components: [],
    prescription: { sourceText: "", sets: 3, target: { type: "reps", min: 10, max: 12 }, toFailure: false, perSide: false, appliesToEachExercise: false, needsReview: false, reviewReason: null },
    rest: { sourceText: "", seconds: 90, needsReview: false },
    sourceRow: null,
  };
}

function newBlock(kind: BlockKind, position: number): BlockDraft {
  return { position, rawTitle: "", name: BLOCK_KIND_LABELS[kind], kind, durationText: null, durationMinutes: null, rounds: null, restBetweenRoundsSeconds: null, optional: false, selection: "all", instructions: [], exercises: [newExercise(1)] };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function ProgramEditor({ initial, version }: { initial: ProgramDraft; version: number }) {
  const [draft, setDraft] = useState<ProgramDraft>(initial);
  const [weekday, setWeekday] = useState(1);
  const [variantIndex, setVariantIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const day = draft.days.find((d) => d.weekday === weekday)!;
  const variant = day.variants[Math.min(variantIndex, Math.max(0, day.variants.length - 1))];

  /** Every change goes through here: copy, change, mark unsaved. */
  function edit(change: (d: ProgramDraft) => void) {
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
    setDirty(true);
    setResult(null);
  }
  const editDay = (change: (d: DayDraft) => void) => edit((p) => change(p.days.find((d) => d.weekday === weekday)!));
  const editBlock = (bi: number, change: (b: BlockDraft) => void) =>
    editDay((d) => change(d.variants[Math.min(variantIndex, d.variants.length - 1)]!.blocks[bi]!));
  const editExercise = (bi: number, ei: number, change: (e: ExerciseDraft) => void, reviewed = true) =>
    editBlock(bi, (b) => {
      const e = b.exercises[ei]!;
      change(e);
      if (reviewed) {
        e.prescription.needsReview = false;
        e.prescription.reviewReason = null;
        e.rest.needsReview = false;
      }
    });

  function swapWith(target: number) {
    edit((p) => {
      const a = p.days.find((d) => d.weekday === weekday)!;
      const b = p.days.find((d) => d.weekday === target)!;
      const { weekday: wa, ...ca } = a;
      const { weekday: wb, ...cb } = b;
      Object.assign(a, cb, { weekday: wa });
      Object.assign(b, ca, { weekday: wb });
    });
    setWeekday(target);
  }

  function save() {
    startTransition(async () => {
      const r = await saveProgramAction(draft);
      if (r.ok) {
        setDirty(false);
        setResult({ ok: true, message: `Version ${r.version} enregistrée. C’est maintenant ton programme actif ; ton historique est intact.` });
      } else {
        setResult({ ok: false, message: r.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <nav role="tablist" aria-label="Jour" className="grid grid-cols-7 gap-1">
        {draft.days.map((d) => (
          <button
            key={d.weekday}
            type="button"
            role="tab"
            aria-selected={d.weekday === weekday}
            aria-label={WEEKDAY_LABELS[d.weekday - 1]}
            onClick={() => {
              setWeekday(d.weekday);
              setVariantIndex(0);
            }}
            className={`flex h-12 flex-col items-center justify-center rounded-xl text-[13px] font-semibold ${d.weekday === weekday ? "bg-accent text-on-accent" : d.variants.length ? "bg-card" : "bg-card text-text-muted"}`}
          >
            {SHORT[d.weekday - 1]}
            <span aria-hidden className={`mt-0.5 size-1.5 rounded-full ${d.variants.some((v) => v.blocks.some((b) => b.exercises.some((e) => e.prescription.needsReview || e.rest.needsReview))) ? "bg-warn" : "bg-transparent"}`} />
          </button>
        ))}
      </nav>

      <section className="flex flex-col gap-3 rounded-[20px] bg-card p-4" aria-label={WEEKDAY_LABELS[weekday - 1]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="focus" className="px-1 text-[13px] font-semibold text-text-muted">{WEEKDAY_LABELS[weekday - 1]} · intitulé</label>
          <input id="focus" value={day.focus ?? ""} maxLength={200} onChange={(e) => editDay((d) => void (d.focus = e.target.value || null))} className={input} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] font-semibold text-text-muted">Type de jour</span>
            <select
              value={day.variants.length === 0 ? (day.kind === "recovery" ? "recovery" : "rest") : day.kind}
              onChange={(e) => {
                const k = e.target.value as DayDraft["kind"];
                editDay((d) => {
                  if (k === "rest") d.variants = [];
                  if ((k === "strength" || k === "choice") && d.variants.length === 0) d.variants = [{ number: 1, label: "Séance", blocks: [newBlock("strength", 1)] }];
                  d.kind = k;
                });
              }}
              className={input}
            >
              <option value="strength">Séance</option>
              <option value="choice">Au choix (plusieurs options)</option>
              <option value="recovery">Récupération</option>
              <option value="rest">Repos</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] font-semibold text-text-muted">Échanger avec</span>
            <select value="" onChange={(e) => e.target.value && swapWith(Number(e.target.value))} className={input}>
              <option value="">—</option>
              {WEEKDAY_LABELS.map((l, i) => (i + 1 === weekday ? null : <option key={l} value={i + 1}>{l}</option>))}
            </select>
          </label>
        </div>
        {day.kind === "recovery" && (
          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] font-semibold text-text-muted">Objectif de pas</span>
            <input inputMode="numeric" value={day.stepsTarget ?? ""} onChange={(e) => editDay((d) => void (d.stepsTarget = num(e.target.value)))} className={input} />
          </label>
        )}
      </section>

      {day.variants.length > 1 || day.kind === "choice" ? (
        <div className="flex flex-col gap-2">
          <div role="tablist" aria-label="Options" className="flex gap-2 overflow-x-auto">
            {day.variants.map((v, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === variantIndex} onClick={() => setVariantIndex(i)} className={`h-10 shrink-0 rounded-xl px-3 text-[14px] font-semibold ${i === variantIndex ? "bg-accent text-on-accent" : "bg-card"}`}>
                {i + 1}. {v.label}
              </button>
            ))}
            {day.variants.length < 5 && (
              <button type="button" onClick={() => { editDay((d) => void d.variants.push({ number: d.variants.length + 1, label: `Option ${d.variants.length + 1}`, blocks: [newBlock("circuit", 1)] })); setVariantIndex(day.variants.length); }} className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-card px-3 text-[14px] font-semibold text-accent">
                <Plus aria-hidden size={16} /> Option
              </button>
            )}
          </div>
          {variant && (
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="sr-only">Nom de l’option</span>
                <input value={variant.label} maxLength={60} onChange={(e) => editDay((d) => void (d.variants[variantIndex]!.label = e.target.value))} className={input} />
              </label>
              {day.variants.length > 1 && (
                <button type="button" aria-label="Supprimer cette option" onClick={() => { editDay((d) => void d.variants.splice(variantIndex, 1)); setVariantIndex(0); }} className="flex size-11 items-center justify-center rounded-xl bg-card text-warn">
                  <Trash2 aria-hidden size={18} />
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {variant?.blocks.map((block, bi) => (
        <section key={bi} aria-label={BLOCK_KIND_LABELS[block.kind]} className="flex flex-col gap-3 rounded-[20px] bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[18px] font-bold">{BLOCK_KIND_LABELS[block.kind]}</h2>
            <button type="button" aria-label="Supprimer la section" onClick={() => editDay((d) => void d.variants[variantIndex]!.blocks.splice(bi, 1))} className="flex size-11 items-center justify-center rounded-xl text-warn">
              <Trash2 aria-hidden size={18} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[13px]">
            <label className="flex flex-col gap-1">
              <span className="px-1 font-semibold text-text-muted">Exercices</span>
              <select value={block.selection} onChange={(e) => editBlock(bi, (b) => void (b.selection = e.target.value as BlockDraft["selection"]))} className={input}>
                <option value="all">Tous</option>
                <option value="pickOne">1 au choix</option>
                <option value="pickAny">Au choix</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="px-1 font-semibold text-text-muted">Tours</span>
              <input inputMode="numeric" value={block.rounds ?? ""} placeholder="—" onChange={(e) => editBlock(bi, (b) => void (b.rounds = num(e.target.value)))} className={small} />
            </label>
            <label className="flex min-h-11 items-end gap-2 pb-2.5">
              <input type="checkbox" checked={block.optional} onChange={(e) => editBlock(bi, (b) => void (b.optional = e.target.checked))} className="size-5 accent-[var(--accent)]" />
              <span className="font-semibold">Optionnel</span>
            </label>
          </div>
          {block.instructions.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="px-1 text-[13px] font-semibold text-text-muted">Consignes</span>
              <textarea rows={2} value={block.instructions.join("\n")} onChange={(e) => editBlock(bi, (b) => void (b.instructions = e.target.value.split("\n").filter(Boolean)))} className="rounded-xl border-0 bg-fill px-3 py-2 text-[15px] outline-none ring-accent focus:ring-2" />
            </label>
          )}

          <ol className="flex flex-col gap-3">
            {block.exercises.map((ex, ei) => (
              <ExerciseEditor
                key={ei}
                exercise={ex}
                first={ei === 0}
                last={ei === block.exercises.length - 1}
                onChange={(change, reviewed) => editExercise(bi, ei, change, reviewed)}
                onMove={(delta) => editBlock(bi, (b) => {
                  const [moved] = b.exercises.splice(ei, 1);
                  b.exercises.splice(ei + delta, 0, moved!);
                })}
                onDelete={() => editBlock(bi, (b) => void b.exercises.splice(ei, 1))}
              />
            ))}
          </ol>
          <button type="button" onClick={() => editBlock(bi, (b) => void b.exercises.push(newExercise(b.exercises.length + 1)))} className="flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-accent">
            <Plus aria-hidden size={18} /> Ajouter un exercice
          </button>
        </section>
      ))}

      {variant && (
        <div className="flex flex-wrap gap-2">
          {(["strength", "abs", "core", "finisher", "conditioning", "circuit"] as const).map((k) => (
            <button key={k} type="button" onClick={() => editDay((d) => void d.variants[variantIndex]!.blocks.push(newBlock(k, d.variants[variantIndex]!.blocks.length + 1)))} className="flex h-10 items-center gap-1 rounded-xl bg-card px-3 text-[14px] font-semibold text-accent">
              <Plus aria-hidden size={16} /> {BLOCK_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {result && (
            <p role={result.ok ? "status" : "alert"} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] ${result.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>
              {result.ok && <CheckCircle2 aria-hidden size={18} />} {result.message} {result.ok && <Link href="/" className="font-semibold underline">Accueil</Link>}
            </p>
          )}
          <button type="button" onClick={save} disabled={!dirty || pending} className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent disabled:opacity-40">
            {pending && <LoaderCircle aria-hidden size={18} className="animate-spin" />}
            {dirty ? `Enregistrer (version ${version + 1})` : "Aucune modification"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExerciseEditor({ exercise: e, first, last, onChange, onMove, onDelete }: {
  exercise: ExerciseDraft;
  first: boolean;
  last: boolean;
  onChange: (change: (e: ExerciseDraft) => void, reviewed?: boolean) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const p = e.prescription;
  const type = p.target?.type ?? "reps";
  const review = p.needsReview || e.rest.needsReview;
  return (
    <li className={`flex flex-col gap-2 rounded-2xl p-3 ${review ? "bg-warn-soft" : "bg-bg"}`}>
      {review && (
        <p className="text-[13px] text-warn">
          À revoir — texte d’origine : <code>{p.sourceText || "—"}</code>
          {e.rest.needsReview && <> · repos <code>{e.rest.sourceText}</code></>}
        </p>
      )}
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Nom de l’exercice</span>
          <input value={e.name} maxLength={120} placeholder="Nom de l’exercice" onChange={(v) => onChange((x) => void (x.name = v.target.value), false)} className={`${input} font-semibold`} />
        </label>
        <button type="button" aria-label="Monter" disabled={first} onClick={() => onMove(-1)} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card disabled:opacity-30"><ArrowUp aria-hidden size={18} /></button>
        <button type="button" aria-label="Descendre" disabled={last} onClick={() => onMove(1)} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card disabled:opacity-30"><ArrowDown aria-hidden size={18} /></button>
        <button type="button" aria-label="Supprimer l’exercice" onClick={onDelete} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-warn"><Trash2 aria-hidden size={18} /></button>
      </div>
      <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[12px]">
        <label className="flex flex-col gap-1">
          <span className="px-1 font-semibold text-text-muted">Séries</span>
          <input inputMode="numeric" value={p.sets ?? ""} onChange={(v) => onChange((x) => void (x.prescription.sets = num(v.target.value)))} className={small} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="px-1 font-semibold text-text-muted">Type</span>
          <select
            value={type}
            onChange={(v) =>
              onChange((x) => {
                const t = v.target.value;
                x.prescription.target = t === "duration" ? { type: "duration", seconds: 45 } : t === "maxReps" ? { type: "maxReps" } : { type: "reps", min: 10, max: 12 };
              })
            }
            className={small}
          >
            <option value="reps">Reps</option>
            <option value="duration">Durée</option>
            <option value="maxReps">Max</option>
          </select>
        </label>
        {p.target?.type === "reps" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="px-1 font-semibold text-text-muted">Reps min</span>
              <input inputMode="numeric" value={p.target.min} onChange={(v) => onChange((x) => { if (x.prescription.target?.type === "reps") x.prescription.target.min = num(v.target.value) ?? 0; })} className={small} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="px-1 font-semibold text-text-muted">Reps max</span>
              <input inputMode="numeric" value={p.target.max} onChange={(v) => onChange((x) => { if (x.prescription.target?.type === "reps") x.prescription.target.max = num(v.target.value) ?? 0; })} className={small} />
            </label>
          </>
        ) : p.target?.type === "duration" ? (
          <label className="col-span-2 flex flex-col gap-1">
            <span className="px-1 font-semibold text-text-muted">Durée (s)</span>
            <input inputMode="numeric" value={p.target.seconds} onChange={(v) => onChange((x) => { if (x.prescription.target?.type === "duration") x.prescription.target.seconds = num(v.target.value) ?? 1; })} className={small} />
          </label>
        ) : (
          <span className="col-span-2" />
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-3 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="px-1 font-semibold text-text-muted">Repos (s)</span>
          <input inputMode="numeric" value={e.rest.seconds ?? ""} placeholder="—" onChange={(v) => onChange((x) => void (x.rest.seconds = num(v.target.value)))} className={small} />
        </label>
        <label className="flex min-h-11 items-center gap-1.5"><input type="checkbox" checked={p.toFailure} onChange={(v) => onChange((x) => void (x.prescription.toFailure = v.target.checked))} className="size-5 accent-[var(--accent)]" /> Échec</label>
        <label className="flex min-h-11 items-center gap-1.5"><input type="checkbox" checked={p.perSide} onChange={(v) => onChange((x) => void (x.prescription.perSide = v.target.checked))} className="size-5 accent-[var(--accent)]" /> Par côté</label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="sr-only">Note</span>
          <input value={e.note ?? ""} placeholder="Note" maxLength={300} onChange={(v) => onChange((x) => void (x.note = v.target.value || null), false)} className={input} />
        </label>
        <label>
          <span className="sr-only">Alternatives (séparées par « ou »)</span>
          <input
            value={e.alternatives.join(" ou ")}
            placeholder="Alternatives : A ou B"
            onChange={(v) => onChange((x) => void (x.alternatives = v.target.value.split(/\s+ou\s+/i).map((s) => s.trim()).filter(Boolean).slice(0, 6)), false)}
            className={input}
          />
        </label>
      </div>
      <p className="px-1 text-[12px] text-text-muted">Prévu : {formatPrescription(p)}</p>
    </li>
  );
}
