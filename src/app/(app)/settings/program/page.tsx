import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { ProgramEditor } from "@/components/program/program-editor";
import { getDb } from "@/db/client";
import { programToDraft } from "@/features/program/edit-program";
import { loadActiveProgram } from "@/features/program/load-program";
import { requireOwner } from "@/lib/auth/current-owner";

export default function ProgramPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),1.5rem)] lg:max-w-2xl lg:px-8">
      <Link href="/settings" className="-ml-1 flex min-h-11 w-fit items-center text-[17px] text-accent">
        <ChevronLeft aria-hidden size={22} strokeWidth={2.2} /> Réglages
      </Link>
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">Modifier le programme</h1>
        <p className="text-[15px] text-text-muted">Chaque enregistrement crée une nouvelle version. Tes séances passées gardent le programme d’alors.</p>
      </header>
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-[20px] bg-card" />}>
        <Editor />
      </Suspense>
    </main>
  );
}

async function Editor() {
  await connection();
  await requireOwner();
  const program = await loadActiveProgram(getDb());
  if (!program) {
    return (
      <p className="rounded-[18px] bg-card p-4 text-[15px] text-text-muted">
        Aucun programme à modifier. <Link href="/settings/import" className="font-semibold text-accent">Importe ton fichier Excel</Link>.
      </p>
    );
  }
  return <ProgramEditor initial={programToDraft(program)} version={program.version} />;
}
