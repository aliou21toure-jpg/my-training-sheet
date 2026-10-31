"use client";

/**
 * Saves sets reliably on a gym's flaky network.
 *
 * Every change goes into a queue that is mirrored in localStorage, then
 * sent to the server in order. If the network drops, items stay queued
 * (and survive a page refresh) and are retried automatically. The same
 * set changed twice keeps only its latest value.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { removeSetAction, saveSetAction } from "@/app/(app)/workout/actions";

export interface SetPayload {
  sessionId: string;
  snapshotKey: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  completed: boolean;
}

export type QueueItem =
  | { id: string; kind: "save"; payload: SetPayload }
  | { id: string; kind: "remove"; payload: { sessionId: string; snapshotKey: string; setNumber: number } };

export type SaveStatus = "saved" | "saving" | "offline" | "error";

export const queueItemId = (snapshotKey: string, setNumber: number) => `${snapshotKey}#${setNumber}`;

function readStored(key: string): QueueItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
  } catch {
    return [];
  }
}

export function useSaveQueue(sessionId: string, onRestore: (items: QueueItem[]) => void) {
  const storageKey = `mts:queue:${sessionId}`;
  const queue = useRef(new Map<string, QueueItem>());
  const running = useRef<Promise<boolean> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const persist = useCallback(() => {
    setPending(queue.current.size);
    try {
      if (queue.current.size === 0) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify([...queue.current.values()]));
    } catch {
      /* private mode / storage full: the in-memory queue still works */
    }
  }, [storageKey]);

  /** Sends queued items in order. Returns false if the network stopped it. */
  const drain = useCallback(async (): Promise<boolean> => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    while (queue.current.size > 0) {
      const [id, item] = queue.current.entries().next().value as [string, QueueItem];
      setStatus("saving");
      let result;
      try {
        result = item.kind === "save" ? await saveSetAction(item.payload) : await removeSetAction(item.payload);
      } catch {
        // Network or server unreachable: keep the item, try again soon.
        setStatus("offline");
        retryTimer.current = setTimeout(() => setRetryTick((t) => t + 1), 4000);
        return false;
      }
      // Only drop it if nobody changed this set again in the meantime.
      if (queue.current.get(id) === item) queue.current.delete(id);
      if (!result.ok) setError(result.message); // refused (e.g. session finished): not retried
      persist();
    }
    setStatus("saved");
    return true;
  }, [persist]);

  /**
   * One sender at a time. A caller arriving while a send is in flight
   * (e.g. "Terminer" right after a validation) WAITS for it, then sends
   * what is left — it must not be told "not sent" while sending is under way.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    while (running.current) await running.current;
    if (queue.current.size === 0) return true;
    const run = drain();
    running.current = run;
    try {
      return await run;
    } finally {
      if (running.current === run) running.current = null;
    }
  }, [drain]);
  // A failed send schedules a retry by bumping this counter.
  useEffect(() => {
    if (retryTick > 0) void flush();
  }, [retryTick, flush]);

  const enqueue = useCallback(
    (item: QueueItem) => {
      queue.current.delete(item.id); // re-insert at the end, latest value wins
      queue.current.set(item.id, item);
      persist();
      void flush();
    },
    [flush, persist],
  );

  const forget = useCallback(
    (id: string) => {
      queue.current.delete(id);
      persist();
    },
    [persist],
  );

  // Restore what was not yet sent before a refresh, then send it.
  useEffect(() => {
    const stored = readStored(storageKey);
    if (stored.length > 0) {
      for (const item of stored) queue.current.set(item.id, item);
      onRestore(stored);
      persist();
      void flush();
    }
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // Run once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Warn before leaving with unsent sets.
  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  return { enqueue, forget, flush, pending, status, error, clearError: () => setError(null) };
}
