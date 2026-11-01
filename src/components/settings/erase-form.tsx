"use client";

import { useActionState, useState } from "react";
import { eraseAction, type EraseState } from "@/app/(app)/settings/actions";

/** Destructive actions: a sheet that asks to type EFFACER. */
export function EraseForm() {
  const [scope, setScope] = useState<"history" | "everything" | null>(null);
  const [state, action, pending] = useActionState<EraseState, FormData>(eraseAction, { error: null });

  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] bg-card">
      <button type="button" onClick={() => setScope("history")} className="min-h-14 px-4 text-left text-[16px] text-warn">
        Effacer l’historique des séances
      </button>
      <button type="button" onClick={() => setScope("everything")} className="min-h-14 border-t border-line px-4 text-left text-[16px] text-warn">
        Tout effacer (programme compris)
      </button>

      {scope && (
        <div role="dialog" aria-modal="true" aria-labelledby="erase-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
          <form action={action} className="flex w-full max-w-md flex-col gap-4 rounded-t-[28px] bg-card p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-[28px]">
            <input type="hidden" name="scope" value={scope} />
            <h2 id="erase-title" className="text-[22px] font-bold tracking-tight">
              {scope === "history" ? "Effacer l’historique ?" : "Tout effacer ?"}
            </h2>
            <p className="text-[15px] text-text-muted">
              {scope === "history"
                ? "Toutes tes séances, séries et changements de calendrier seront supprimés définitivement. Ton programme est conservé."
                : "Tes séances, ton historique et toutes les versions du programme seront supprimés définitivement. Ton compte et tes réglages sont conservés."}{" "}
              Pense à exporter tes données avant.
            </p>
            <label htmlFor="confirmation" className="text-[14px] font-semibold">Tape EFFACER pour confirmer</label>
            <input id="confirmation" name="confirmation" autoComplete="off" autoCapitalize="characters" className="h-11 rounded-xl border-0 bg-fill px-3 text-[16px] outline-none ring-warn focus:ring-2" />
            {state.error && <p role="alert" className="text-[14px] text-warn">{state.error}</p>}
            <button type="submit" disabled={pending} className="h-[52px] rounded-[14px] bg-warn text-[17px] font-semibold text-card disabled:opacity-60">
              Effacer définitivement
            </button>
            <button type="button" onClick={() => setScope(null)} className="h-11 rounded-[14px] bg-fill text-[16px] font-semibold">
              Annuler
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
