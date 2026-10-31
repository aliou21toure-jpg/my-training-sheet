import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ImportForm } from "@/components/import/import-form";

export const metadata: Metadata = { title: "Importer le programme · My Training Sheet" };

export default function ImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-6">
      <Link href="/" className="-ml-1 flex min-h-11 w-fit items-center text-[17px] text-accent">
        <ChevronLeft aria-hidden size={22} strokeWidth={2.2} />
        Réglages
      </Link>
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">Importer le programme</h1>
        <p className="text-[15px] text-text-muted">
          Vérifie l’aperçu avant d’enregistrer : chaque ligne garde le texte d’origine de l’Excel.
        </p>
      </header>
      <ImportForm />
    </main>
  );
}
