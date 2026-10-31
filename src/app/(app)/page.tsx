import Link from "next/link";
import { ChevronRight, FileSpreadsheet, LogOut } from "lucide-react";
import { signOutAction } from "./actions";

/** Temporary home until the Today screen (week 2, task 3). */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-16 pt-[max(env(safe-area-inset-top),3.5rem)]">
      <header className="flex flex-col gap-1 px-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">My Training Sheet</p>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">Bonjour, Alex</h1>
        <p className="text-[15px] text-text-muted">L’écran Aujourd’hui arrive à l’étape suivante.</p>
      </header>

      <nav aria-label="Réglages" className="overflow-hidden rounded-[20px] bg-card">
        <Link href="/settings/import" className="flex min-h-14 items-center gap-3 px-4">
          <FileSpreadsheet aria-hidden size={20} className="text-accent" />
          <span className="flex-1 text-[16px]">Importer le programme</span>
          <ChevronRight aria-hidden size={18} className="text-text-muted" />
        </Link>
        <form action={signOutAction} className="border-t border-line">
          <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
            <LogOut aria-hidden size={20} className="text-text-muted" />
            <span className="flex-1 text-[16px]">Se déconnecter</span>
          </button>
        </form>
      </nav>
    </main>
  );
}
