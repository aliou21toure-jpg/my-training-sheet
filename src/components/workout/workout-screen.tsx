"use client";

import Link from "next/link";
import { ChevronLeft, Cloud, CloudOff, LoaderCircle, Pause, Play, SkipForward, Timer } from "lucide-react";
import { startTransition, useCallback, useMemo, useRef, useState } from "react";
import { abandonAction, finishAction, notesAction, pauseAction, resumeAction } from "@/app/(app)/workout/actions";
import { BLOCK_KIND_LABELS } from "@/features/import/format";
import type { SessionView } from "@/features/workouts/session";
import { draftFromLog, formatClock, parseSetDraft, type SetDraft } from "@/features/workouts/set-values";
import type { SnapshotExercise } from "@/features/workouts/snapshot";
import type { LoggedSet } from "@/features/workouts/summary";
import { formatDisplayNumber, type WeightUnit } from "@/lib/units";
import { ExerciseCard, type Field } from "./exercise-card";
import { queueItemId, useSaveQueue, type QueueItem } from "./use-save-queue";
import { useRestTimer, useSessionClock } from "./use-timers";

const DEFAULT_REST_SECONDS = 90;
const SAVE_DELAY_MS = 800;

type Drafts = Record<string, SetDraft[]>;

function emptyDraft(setNumber: number): SetDraft {
  return { setNumber, weight: "", reps: "", duration: "", completed: false };
}

function initialDrafts(session: SessionView, unit: WeightUnit): Drafts {
  const drafts: Drafts = {};
  for (const block of session.snapshot.blocks) {
    for (const e of block.exercises) {
      const logs = session.logs.filter((l) => l.snapshotKey === e.key);
      const rows = Math.max(e.plannedSets, ...logs.map((l) => l.setNumber));
      drafts[e.key] = Array.from({ length: rows }, (_, i) => {
        const log = logs.find((l) => l.setNumber === i + 1);
        return log ? draftFromLog(log, e, unit) : emptyDraft(i + 1);
      });
    }
  }
  return drafts;
}

const isComplete = (rows: SetDraft[] | undefined) => !!rows && rows.length > 0 && rows.every((r) => r.completed);

export function WorkoutScreen({ session, previous, unit }: { session: SessionView; previous: Record<string, LoggedSet[]>; unit: WeightUnit }) {
  const snapshot = session.snapshot;
  const exercises = useMemo(() => snapshot.blocks.flatMap((b) => b.exercises.map((e) => ({ e, block: b }))), [snapshot]);
  const byKey = useMemo(() => new Map(exercises.map((x) => [x.e.key, x])), [exercises]);

  const [drafts, setDraftsState] = useState<Drafts>(() => initialDrafts(session, unit));
  // Event handlers read the latest drafts from this ref; every update goes through writeDrafts.
  const draftsRef = useRef(drafts);
  const writeDrafts = useCallback((update: (current: Drafts) => Drafts) => {
    const next = update(draftsRef.current);
    draftsRef.current = next;
    setDraftsState(next);
  }, []);
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set());
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [paused, setPaused] = useState(session.status === "paused");
  const [notes, setNotes] = useState(session.notes ?? "");
  const [confirming, setConfirming] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const firstOpen = exercises.find(({ e, block }) => !block.optional && !isComplete(drafts[e.key]))?.e.key ?? exercises[0]?.e.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(firstOpen);

  // Re-apply changes that were not sent before a refresh.
  const restore = useCallback(
    (items: QueueItem[]) => {
      writeDrafts((current) => {
        const next = { ...current };
        for (const item of items) {
          const x = byKey.get(item.payload.snapshotKey);
          if (!x) continue;
          const rows = [...(next[x.e.key] ?? [])];
          if (item.kind === "remove") {
            next[x.e.key] = rows.filter((r) => r.setNumber !== item.payload.setNumber);
            continue;
          }
          while (rows.length < item.payload.setNumber) rows.push(emptyDraft(rows.length + 1));
          rows[item.payload.setNumber - 1] = draftFromLog({ ...item.payload, exerciseId: x.e.exerciseId }, x.e, unit);
          next[x.e.key] = rows;
        }
        return next;
      });
    },
    [byKey, writeDrafts, unit],
  );

  const queue = useSaveQueue(session.id, restore);
  const rest = useRestTimer(session.id);
  const elapsed = useSessionClock(session.activeSeconds, paused);

  const markInvalid = (key: string, setNumber: number, field: Field | null) =>
    setInvalid((cur) => {
      const next = new Set([...cur].filter((k) => !k.startsWith(`${key}#${setNumber}#`)));
      if (field) next.add(`${key}#${setNumber}#${field}`);
      return next;
    });

  /** Validates one set and queues it for saving. */
  function commit(e: SnapshotExercise, setNumber: number, override?: SetDraft) {
    const id = queueItemId(e.key, setNumber);
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);

    const draft = override ?? draftsRef.current[e.key]?.find((d) => d.setNumber === setNumber);
    if (!draft) return;
    const parsed = parseSetDraft(draft, e, unit);
    if (!parsed.ok) return markInvalid(e.key, setNumber, parsed.field);
    markInvalid(e.key, setNumber, null);
    queue.enqueue({
      id,
      kind: "save",
      payload: { sessionId: session.id, snapshotKey: e.key, setNumber, weightKg: parsed.weightKg, reps: parsed.reps, durationSeconds: parsed.durationSeconds, completed: draft.completed },
    });
  }

  function updateRow(key: string, setNumber: number, change: (d: SetDraft) => SetDraft): SetDraft | undefined {
    let updated: SetDraft | undefined;
    writeDrafts((cur) => ({
      ...cur,
      [key]: (cur[key] ?? []).map((d) => (d.setNumber === setNumber ? (updated = change(d)) : d)),
    }));
    return updated;
  }

  function onChange(e: SnapshotExercise, setNumber: number, field: Field, value: string) {
    updateRow(e.key, setNumber, (d) => ({ ...d, [field]: value }));
    const id = queueItemId(e.key, setNumber);
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.set(id, setTimeout(() => commit(e, setNumber), SAVE_DELAY_MS));
  }

  function onCheck(e: SnapshotExercise, restSeconds: number | null, setNumber: number) {
    const current = draftsRef.current[e.key]?.find((d) => d.setNumber === setNumber);
    if (!current) return;
    const prev = previous[e.exerciseId]?.find((l) => l.setNumber === setNumber);
    const completing = !current.completed;
    // Validating an empty row adopts last time's values (shown as placeholders), never invented ones.
    const filled: SetDraft = completing && prev
      ? {
          ...current,
          weight: current.weight || (prev.weightKg != null ? formatDisplayNumber(prev.weightKg, unit) : ""),
          reps: current.reps || (prev.reps != null ? String(prev.reps) : ""),
          duration: current.duration || draftFromLog(prev, e, unit).duration,
        }
      : current;
    const next = { ...filled, completed: completing };
    updateRow(e.key, setNumber, () => next);
    commit(e, setNumber, next);

    if (completing) {
      const rows = (draftsRef.current[e.key] ?? []).map((d) => (d.setNumber === setNumber ? next : d));
      if (isComplete(rows)) {
        // Move on to the next unfinished exercise.
        const after = exercises.slice(exercises.findIndex((x) => x.e.key === e.key) + 1);
        const nextOpen = after.find(({ e: x, block }) => !skipped.has(block.key) && !isComplete(draftsRef.current[x.key]));
        setOpenKey(nextOpen?.e.key ?? null);
      }
      const seconds = restSeconds ?? DEFAULT_REST_SECONDS;
      if (seconds > 0) rest.start(seconds);
    }
  }

  function onAdd(e: SnapshotExercise) {
    writeDrafts((cur) => {
      const rows = cur[e.key] ?? [];
      const last = rows.at(-1);
      return { ...cur, [e.key]: [...rows, { ...emptyDraft(rows.length + 1), weight: last?.weight ?? "" }] };
    });
  }

  function onRemove(e: SnapshotExercise) {
    const rows = draftsRef.current[e.key] ?? [];
    const last = rows.at(-1);
    if (!last || rows.length <= 1) return;
    writeDrafts((cur) => ({ ...cur, [e.key]: rows.slice(0, -1) }));
    markInvalid(e.key, last.setNumber, null);
    queue.enqueue({ id: queueItemId(e.key, last.setNumber), kind: "remove", payload: { sessionId: session.id, snapshotKey: e.key, setNumber: last.setNumber } });
  }

  async function togglePause() {
    const next = !paused;
    setPaused(next);
    const result = next ? await pauseAction(session.id) : await resumeAction(session.id);
    if (!result.ok) setPaused(!next);
  }

  async function finish() {
    setBusy(true);
    setFinishError(null);
    for (const [, t] of timers.current) clearTimeout(t);
    // Send any typed-but-unsent value first.
    for (const { e } of exercises) for (const d of draftsRef.current[e.key] ?? []) if (d.weight || d.reps || d.duration) commit(e, d.setNumber);
    const sent = await queue.flush();
    if (!sent) {
      setBusy(false);
      setFinishError("Des séries ne sont pas encore envoyées (pas de réseau). Réessaie dans un instant : rien n’est perdu.");
      return;
    }
    rest.skip();
    startTransition(async () => {
      const result = await finishAction(session.id, notes);
      if (result && !result.ok) {
        setFinishError(result.message);
        setBusy(false);
      }
    });
  }

  function abandon() {
    if (!window.confirm("Abandonner la séance ? Elle ne comptera pas dans tes progrès.")) return;
    startTransition(async () => {
      await abandonAction(session.id);
    });
  }

  const counted = exercises.filter(({ block }) => !block.optional || !skipped.has(block.key));
  const doneSets = Object.values(drafts).flat().filter((d) => d.completed).length;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-44 pt-[max(env(safe-area-inset-top),0.75rem)] lg:max-w-2xl lg:px-8 lg:pb-32 lg:pt-8">
      <header className="flex items-center justify-between gap-2">
        <Link href="/" className="-ml-1 flex min-h-11 items-center text-[17px] text-accent">
          <ChevronLeft aria-hidden size={22} strokeWidth={2.2} />
          Aujourd’hui
        </Link>
        <SaveIndicator status={queue.status} pending={queue.pending} />
        <button
          type="button"
          onClick={togglePause}
          className="flex h-11 items-center gap-1.5 rounded-full bg-fill px-4 text-[15px] font-semibold"
          aria-label={paused ? "Reprendre la séance" : "Mettre la séance en pause"}
        >
          {paused ? <Play aria-hidden size={16} fill="currentColor" strokeWidth={0} /> : <Pause aria-hidden size={16} fill="currentColor" strokeWidth={0} />}
          {paused ? "Reprendre" : "Pause"}
        </button>
      </header>

      <section className="flex flex-col gap-1 px-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">
          {snapshot.title}
        </p>
        <div className="flex items-baseline justify-between">
          <p className="text-[44px] font-bold leading-[50px] tracking-tight tabular-nums" aria-label={`Durée ${formatClock(elapsed)}`}>
            {formatClock(elapsed)}
          </p>
          <p className="text-[15px] text-text-muted">{paused ? "En pause" : `${doneSets} série${doneSets > 1 ? "s" : ""} validée${doneSets > 1 ? "s" : ""}`}</p>
        </div>
        <div aria-hidden className="mt-2 flex gap-1">
          {counted.map(({ e }) => (
            <span key={e.key} className={`h-1 flex-1 rounded-full ${isComplete(drafts[e.key]) ? "bg-accent" : (drafts[e.key] ?? []).some((d) => d.completed) ? "bg-accent/50" : "bg-fill"}`} />
          ))}
        </div>
      </section>

      {queue.error && (
        <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-[14px] text-warn">
          {queue.error}
        </p>
      )}

      {snapshot.blocks.map((block) => {
        const isSkipped = skipped.has(block.key);
        return (
          <section key={block.key} aria-label={BLOCK_KIND_LABELS[block.kind]} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 px-1 pt-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <h2 className="text-[20px] font-bold tracking-tight">{BLOCK_KIND_LABELS[block.kind]}</h2>
                <span className="text-[13px] text-text-muted">
                  {[
                    block.rounds ? `${block.rounds} tours` : null,
                    block.restBetweenRoundsSeconds ? `${block.restBetweenRoundsSeconds} s entre les tours` : null,
                    block.selection === "pickOne" ? "1 au choix" : block.selection === "pickAny" ? "au choix" : null,
                    block.optional ? "optionnel" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {block.optional && (
                <button
                  type="button"
                  onClick={() => setSkipped((s) => (s.has(block.key) ? new Set([...s].filter((k) => k !== block.key)) : new Set(s).add(block.key)))}
                  className="flex min-h-11 shrink-0 items-center gap-1 text-[15px] font-semibold text-accent"
                >
                  {isSkipped ? "Reprendre" : (<><SkipForward aria-hidden size={16} /> Passer</>)}
                </button>
              )}
            </div>
            {!isSkipped && block.instructions.length > 0 && (
              <details className="px-1 text-[14px] text-text-muted">
                <summary className="cursor-pointer text-[13px] font-semibold">Consignes</summary>
                {block.instructions.map((line) => (
                  <p key={line} className="mt-1 leading-snug">{line}</p>
                ))}
              </details>
            )}
            {isSkipped ? (
              <p className="px-1 text-[14px] text-text-muted">Section passée.</p>
            ) : (
              block.exercises.map((e) => (
                <ExerciseCard
                  key={e.key}
                  exercise={e}
                  unit={unit}
                  rowLabel={block.rounds && !block.exercises.some((x) => x.plannedSets !== block.rounds) ? "Tour" : "Série"}
                  drafts={drafts[e.key] ?? []}
                  previous={previous[e.exerciseId]}
                  invalid={invalid}
                  open={openKey === e.key}
                  disabled={busy}
                  onToggle={() => setOpenKey((k) => (k === e.key ? null : e.key))}
                  onChange={(n, f, v) => onChange(e, n, f, v)}
                  onCommit={(n) => commit(e, n)}
                  onCheck={(n) => onCheck(e, e.restSeconds, n)}
                  onAdd={() => onAdd(e)}
                  onRemove={() => onRemove(e)}
                />
              ))
            )}
          </section>
        );
      })}

      <section className="flex flex-col gap-2 pt-2">
        <label htmlFor="session-notes" className="px-1 text-[20px] font-bold tracking-tight">Notes</label>
        <textarea
          id="session-notes"
          rows={3}
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          onBlur={() => void notesAction(session.id, notes)}
          placeholder="Ressenti, réglages de machine, douleurs…"
          className="w-full resize-none rounded-2xl border-0 bg-card px-4 py-3.5 text-[16px] outline-none ring-accent focus:ring-2"
        />
      </section>

      {rest.rest && (
        <div
          role="timer"
          aria-live="off"
          className="fixed inset-x-4 bottom-[calc(52px+env(safe-area-inset-bottom)+76px)] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-text px-4 py-3 text-bg shadow-lg lg:bottom-24 lg:left-[calc(15rem+2rem)]"
        >
          <Timer aria-hidden size={22} />
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide opacity-70">{rest.remaining > 0 ? "Repos" : "Repos terminé"}</p>
            <p className="text-[26px] font-bold leading-7 tabular-nums">{formatClock(rest.remaining)}</p>
          </div>
          <button type="button" onClick={() => rest.add(-15)} className="h-11 rounded-xl bg-bg/15 px-3 text-[15px] font-semibold">−15 s</button>
          <button type="button" onClick={() => rest.add(15)} className="h-11 rounded-xl bg-bg/15 px-3 text-[15px] font-semibold">+15 s</button>
          <button type="button" onClick={rest.skip} className="h-11 rounded-xl bg-bg px-3 text-[15px] font-semibold text-text">Passer</button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl lg:bottom-0 lg:left-60">
        <div className="mx-auto max-w-xl lg:max-w-2xl">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-[52px] w-full rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent"
          >
            Terminer la séance
          </button>
        </div>
      </div>

      {confirming && (
        <div role="dialog" aria-modal="true" aria-labelledby="finish-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-t-[28px] bg-card p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-[28px]">
            <h2 id="finish-title" className="text-[22px] font-bold tracking-tight">Terminer la séance ?</h2>
            <p className="text-[15px] text-text-muted">
              {doneSets} série{doneSets > 1 ? "s" : ""} validée{doneSets > 1 ? "s" : ""} en {formatClock(elapsed)}. Les séries non validées ne comptent pas dans tes progrès.
            </p>
            {finishError && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-[14px] text-warn">{finishError}</p>}
            <button type="button" onClick={finish} disabled={busy} className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent disabled:opacity-60">
              {busy && <LoaderCircle aria-hidden size={18} className="animate-spin" />}
              Terminer
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-11 rounded-[14px] bg-fill text-[16px] font-semibold">
              Continuer la séance
            </button>
            <button type="button" onClick={abandon} disabled={busy} className="h-11 text-[15px] text-warn">
              Abandonner la séance
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function SaveIndicator({ status, pending }: { status: string; pending: number }) {
  if (status === "offline") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-[12px] font-semibold text-warn">
        <CloudOff aria-hidden size={15} /> Hors ligne · {pending} en attente
      </span>
    );
  }
  if (status === "saving" || pending > 0) {
    return (
      <span role="status" className="flex items-center gap-1.5 text-[12px] text-text-muted">
        <LoaderCircle aria-hidden size={14} className="animate-spin" /> Enregistrement…
      </span>
    );
  }
  return (
    <span role="status" className="flex items-center gap-1.5 text-[12px] text-text-muted">
      <Cloud aria-hidden size={15} /> Enregistré
    </span>
  );
}
