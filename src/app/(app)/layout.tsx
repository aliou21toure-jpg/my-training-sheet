import { Suspense } from "react";
import { requireOwner } from "@/lib/auth/current-owner";

/**
 * Every page in (app) is private. The session is read at request time,
 * so (Cache Components) the check sits behind a Suspense boundary.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <OwnerGate>{children}</OwnerGate>
    </Suspense>
  );
}

async function OwnerGate({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
