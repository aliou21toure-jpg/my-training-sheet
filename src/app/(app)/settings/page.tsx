import Link from "next/link";
import { ChevronRight, FileSpreadsheet, LogOut } from "lucide-react";
import { signOutAction } from "../actions";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-2xl lg:px-10 lg:pt-12">
      <h1 className="px-1 text-[32px] font-bold leading-tight tracking-tight">Réglages</h1>

      <section aria-label="Programme" className="flex flex-col gap-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Programme</h2>
        <div className="overflow-hidden rounded-[20px] bg-card">
          <Link href="/settings/import" className="flex min-h-14 items-center gap-3 px-4">
            <FileSpreadsheet aria-hidden size={20} className="text-accent" />
            <span className="flex-1 text-[16px]">Importer un fichier Excel</span>
            <ChevronRight aria-hidden size={18} className="text-text-muted" />
          </Link>
        </div>
      </section>

      <section aria-label="Compte" className="flex flex-col gap-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Compte</h2>
        <form action={signOutAction} className="overflow-hidden rounded-[20px] bg-card">
          <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
            <LogOut aria-hidden size={20} className="text-text-muted" />
            <span className="flex-1 text-[16px]">Se déconnecter</span>
          </button>
        </form>
      </section>

      <p className="px-1 text-[13px] text-text-muted">Thème, unités et rappels arrivent en semaine 3.</p>
    </main>
  );
}
