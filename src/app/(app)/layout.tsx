import { Suspense } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { ThemeSync } from "@/components/layout/theme-sync";
import { getDb } from "@/db/client";
import { getOwnerSettings } from "@/features/settings/owner-settings";
import { requireOwner } from "@/lib/auth/current-owner";

/**
 * Every page in (app) is private. The session is read at request time,
 * so (Cache Components) the check sits behind a Suspense boundary.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <OwnerGate>
        <div className="flex flex-1 flex-col pb-[calc(52px+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">{children}</div>
        <AppNav />
      </OwnerGate>
    </Suspense>
  );
}

async function OwnerGate({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const { theme } = await getOwnerSettings(getDb(), owner.id);
  return (
    <>
      <ThemeSync theme={theme} />
      {children}
    </>
  );
}
