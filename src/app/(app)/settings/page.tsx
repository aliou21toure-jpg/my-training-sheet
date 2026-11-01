import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarPlus, ChevronRight, Download, FileSpreadsheet, LogOut, PencilLine } from "lucide-react";
import { EraseForm } from "@/components/settings/erase-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { getDb } from "@/db/client";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { requireOwner } from "@/lib/auth/current-owner";
import { signOutAction } from "../actions";

const COMMON_ZONES = ["Europe/Paris", "Africa/Bamako", "America/Toronto", "Europe/London", "America/New_York", "UTC"];

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-2xl lg:px-10 lg:pt-12">
      <h1 className="px-1 text-[32px] font-bold leading-tight tracking-tight">Réglages</h1>
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-[20px] bg-card" />}>
        <Settings />
      </Suspense>
    </main>
  );
}

const row = "flex min-h-14 items-center gap-3 px-4";

async function Settings() {
  await connection();
  const owner = await requireOwner();
  const settings = await getOwnerSettings(getDb(), owner.id);
  const zones = [...new Set([settings.timezone, ...COMMON_ZONES, ...Intl.supportedValuesOf("timeZone")])];

  return (
    <>
      <SettingsForm settings={settings} timeZones={zones} />

      <section aria-labelledby="s-program" className="flex flex-col gap-2">
        <h2 id="s-program" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Programme</h2>
        <div className="overflow-hidden rounded-[20px] bg-card">
          <Link href="/settings/program" className={row}>
            <PencilLine aria-hidden size={20} className="text-accent" />
            <span className="flex-1 text-[16px]">Modifier le programme</span>
            <ChevronRight aria-hidden size={18} className="text-text-muted" />
          </Link>
          <Link href="/settings/import" className={`${row} border-t border-line`}>
            <FileSpreadsheet aria-hidden size={20} className="text-accent" />
            <span className="flex-1 text-[16px]">Importer un fichier Excel</span>
            <ChevronRight aria-hidden size={18} className="text-text-muted" />
          </Link>
          <a href="/api/reminders" className={`${row} border-t border-line`}>
            <CalendarPlus aria-hidden size={20} className="text-accent" />
            <span className="flex-1">
              <span className="block text-[16px]">Ajouter les séances à mon calendrier</span>
              <span className="block text-[13px] text-text-muted">Fichier .ics des 4 prochaines semaines, avec rappel à l’heure choisie</span>
            </span>
          </a>
        </div>
      </section>

      <section aria-labelledby="s-data" className="flex flex-col gap-2">
        <h2 id="s-data" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Mes données</h2>
        <div className="overflow-hidden rounded-[20px] bg-card">
          <a href="/api/export?format=json" className={row}>
            <Download aria-hidden size={20} className="text-accent" />
            <span className="flex-1 text-[16px]">Exporter tout (JSON)</span>
          </a>
          <a href="/api/export?format=csv" className={`${row} border-t border-line`}>
            <Download aria-hidden size={20} className="text-accent" />
            <span className="flex-1 text-[16px]">Exporter les séries (CSV, pour Excel)</span>
          </a>
        </div>
        <EraseForm />
      </section>

      <section aria-labelledby="s-account" className="flex flex-col gap-2">
        <h2 id="s-account" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Compte</h2>
        <form action={signOutAction} className="overflow-hidden rounded-[20px] bg-card">
          <button type="submit" className={`${row} w-full text-left`}>
            <LogOut aria-hidden size={20} className="text-text-muted" />
            <span className="flex-1 text-[16px]">Se déconnecter</span>
          </button>
        </form>
      </section>
    </>
  );
}
