"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

/** Shown when a private page fails to load (database down, network…). */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <TriangleAlert aria-hidden size={40} strokeWidth={1.6} className="text-warn" />
      <h1 className="text-[24px] font-bold tracking-tight">Cette page n’a pas pu se charger</h1>
      <p className="text-[15px] text-text-muted">
        Vérifie ta connexion puis réessaie. Les séries déjà saisies sont gardées sur ton téléphone et seront renvoyées.
      </p>
      <button type="button" onClick={reset} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent">
        <RotateCcw aria-hidden size={18} /> Réessayer
      </button>
      <Link href="/" className="min-h-11 py-2.5 text-[16px] font-semibold text-accent">Retour à l’accueil</Link>
    </main>
  );
}
