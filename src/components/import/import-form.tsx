"use client";

import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { startTransition, useActionState, useCallback, useState } from "react";
import {
  previewImport,
  saveImport,
  type PreviewState,
  type SaveState,
} from "@/app/(app)/settings/import/actions";
import { ProgramPreview } from "./program-preview";

const initialPreview: PreviewState = { status: "idle" };
const initialSave: SaveState = { status: "idle" };

export function ImportForm() {
  const [preview, previewAction, previewing] = useActionState(previewImport, initialPreview);
  const [save, saveAction, saving] = useActionState(saveImport, initialSave);
  const [fileName, setFileName] = useState<string | null>(null);
  // The file that produced the current preview: sent again (as a file) to save it.
  const [previewedFile, setPreviewedFile] = useState<File | null>(null);
  // Which save result belongs to the preview on screen.
  const [savedFor, setSavedFor] = useState<File | null>(null);

  // A file picked before the page finished loading fires no React onChange:
  // read whatever the input already holds once React attaches to it.
  const syncPickedFile = useCallback((input: HTMLInputElement | null) => {
    const picked = input?.files?.[0];
    if (picked) setFileName(picked.name);
  }, []);

  function analyse(formData: FormData) {
    const file = formData.get("workbook");
    setPreviewedFile(file instanceof File ? file : null);
    setSavedFor(null);
    previewAction(formData);
  }

  function saveProgram() {
    if (!previewedFile) return;
    const formData = new FormData();
    formData.set("workbook", previewedFile);
    setSavedFor(previewedFile);
    startTransition(() => saveAction(formData));
  }

  const saveResult = savedFor && savedFor === previewedFile ? save : initialSave;
  const isSaved = saveResult.status === "saved";

  return (
    <div className="flex flex-col gap-5">
      <form
        action={analyse}
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
            ref={syncPickedFile}
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
          disabled={previewing || saving || !fileName}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent transition-opacity disabled:opacity-40"
        >
          {previewing && <LoaderCircle aria-hidden size={18} className="animate-spin" />}
          {previewing ? "Analyse…" : "Analyser le fichier"}
        </button>
      </form>

      <div aria-live="polite">
        {preview.status === "error" && (
          <p role="alert" className="rounded-[18px] bg-warn-soft p-4 text-[15px] text-warn">
            {preview.fileName && <span className="font-semibold">{preview.fileName} : </span>}
            {preview.message}
          </p>
        )}

        {preview.status === "ready" && (
          <div className="flex flex-col gap-5">
            <p className="px-1 text-[15px] text-text-muted">
              Aperçu de <span className="font-semibold text-text">{preview.fileName}</span>.{" "}
              {isSaved ? "Ce programme est enregistré." : "Rien n’est encore enregistré."}
            </p>
            <ProgramPreview program={preview.program} issues={preview.issues} />

            <div className="flex flex-col gap-3 rounded-[22px] bg-card p-4">
              {isSaved ? (
                <div role="status" className="flex flex-col items-center gap-2 py-2 text-center">
                  <CheckCircle2 aria-hidden size={36} className="text-positive" />
                  <p className="text-[17px] font-semibold">Programme enregistré · version {saveResult.version}</p>
                  <p className="text-[14px] text-text-muted">
                    {saveResult.exerciseCount} exercices. C’est maintenant ton programme actif ; les versions
                    précédentes et ton historique sont conservés.
                  </p>
                  <Link href="/" className="mt-1 text-[16px] font-semibold text-accent">
                    Retour à l’accueil
                  </Link>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={saveProgram}
                    disabled={saving || !previewedFile}
                    className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent transition-opacity disabled:opacity-40"
                  >
                    {saving && <LoaderCircle aria-hidden size={18} className="animate-spin" />}
                    {saving ? "Enregistrement…" : "Enregistrer le programme"}
                  </button>
                  {saveResult.status === "error" ? (
                    <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-center text-[14px] text-warn">
                      {saveResult.message}
                    </p>
                  ) : (
                    <p className="text-center text-[13px] text-text-muted">
                      Crée une nouvelle version active. Les lignes « à revoir » restent signalées et pourront être
                      corrigées dans l’éditeur du programme.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
