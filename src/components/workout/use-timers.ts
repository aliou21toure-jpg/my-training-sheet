"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

/**
 * Workout clock: the active time measured by the server at load, then
 * counted locally. Frozen while paused. Time only advances in timer
 * callbacks, never during render.
 */
export function useSessionClock(activeSecondsAtLoad: number, paused: boolean) {
  // banked = seconds counted up to `since`; while running, add (now - since).
  const [clock, setClock] = useState({ banked: activeSecondsAtLoad, since: null as number | null, now: 0 });

  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const tick = () => setClock((c) => ({ ...c, since: c.since ?? start, now: performance.now() }));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      const end = performance.now();
      setClock((c) => ({ banked: c.banked + (end - (c.since ?? start)) / 1000, since: null, now: end }));
    };
  }, [paused]);

  return clock.since === null ? clock.banked : clock.banked + (clock.now - clock.since) / 1000;
}

export interface RestState {
  endsAt: number;
  total: number;
}

/* A tiny store over localStorage, so the rest timer survives a refresh. */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeRaw(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the timer just won't survive a refresh */
  }
  listeners.forEach((l) => l());
}

export function useRestTimer(sessionId: string) {
  const key = `mts:rest:${sessionId}`;
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const rest = useMemo<RestState | null>(() => {
    try {
      return raw ? (JSON.parse(raw) as RestState) : null;
    } catch {
      return null;
    }
  }, [raw]);
  const [now, setNow] = useState(0);

  const save = useCallback(
    (next: RestState | null) => {
      setNow(Date.now());
      writeRaw(key, next ? JSON.stringify(next) : null);
    },
    [key],
  );

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= rest.endsAt + 4000) save(null); // hide a few seconds after the end
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [rest, save]);

  const remaining = !rest ? 0 : now === 0 ? rest.total : Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const finished = !!rest && now !== 0 && remaining === 0;

  useEffect(() => {
    if (finished) navigator.vibrate?.([200, 100, 200]);
  }, [finished]);

  return {
    rest,
    remaining,
    start: (seconds: number) => save({ endsAt: Date.now() + seconds * 1000, total: seconds }),
    add: (delta: number) => {
      if (rest) save({ endsAt: Math.max(Date.now(), rest.endsAt + delta * 1000), total: Math.max(1, rest.total + delta) });
    },
    skip: () => save(null),
  };
}
