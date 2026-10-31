"use client";

import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { previewImport, type PreviewState } from "@/app/(app)/settings/import/actions";
import { ProgramPreview } from "./program-preview";

const initialState: PreviewState = { status: "idle" };

export function ImportForm() {
  const [state, formAction, pending] = useActionState(previewImport, initialState);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <form
        action={formAction}
        // React resets the form after each action: the chosen file is cleared, so the label must be too.
        onReset={() => setFileName(null)}
        className="flex flex-col gap-3 rounded-[22px] bg-card p-4"
      >
        <label
          htmlFor="workbook"
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-5 text-center transition-colors hover:border-accent focus-within:border-accent"
        >
          <FileSpreadsheet aria-hidden size={28} strokeWidth={1.8} className="text-accent" />
          <span className="text-[15px] font-semibold">{fileName ?? "Choisir ton fichier .xlsx"}</span>
          <span className="text-[13px] text-text-muted">Lu en mémoire, jamais stocké. 900 Ko maximum.</span>
          <input
            id="workbook"
            name="workbook"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="sr-only"
            onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent transition-opacity disabled:opacity-40"
        >
          {pending && <LoaderCircle aria-hidden size={18} className="animate-spin" />}
          {pending ? "Analyse…" : "Analyser le fichier"}
        </button>
      </form>

      <div aria-live="polite">
        {state.status === "error" && (
          <p role="alert" className="rounded-[18px] bg-warn-soft p-4 text-[15px] text-warn">
            {state.fileName && <span className="font-semibold">{state.fileName} : </span>}
            {state.message}
          </p>
        )}

        {state.status === "ready" && (
          <div className="flex flex-col gap-5">
            <p className="px-1 text-[15px] text-text-muted">
              Aperçu de <span className="font-semibold text-text">{state.fileName}</span>. Rien n’est encore enregistré.
            </p>
            <ProgramPreview program={state.program} issues={state.issues} />
            <div className="flex flex-col gap-2 rounded-[22px] bg-card p-4">
              <button
                type="button"
                disabled
                className="h-[52px] rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent opacity-40"
              >
                Enregistrer le programme
              </button>
              <p className="text-center text-[13px] text-text-muted">
                Disponible quand la base de données sera branchée.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
