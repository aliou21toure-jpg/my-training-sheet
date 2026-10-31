import { connection } from "next/server";
import { Suspense } from "react";
import { TodayScreen } from "@/components/today/today-screen";
import { getDb } from "@/db/client";
import { getTodayView } from "@/features/today/get-today";
import { requireOwner } from "@/lib/auth/current-owner";

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  await connection(); // "today" depends on the request time: never prerendered
  const owner = await requireOwner();
  const view = await getTodayView(getDb(), owner.id, new Date());
  return <TodayScreen view={view} />;
}

function TodaySkeleton() {
  return (
    <main aria-busy="true" className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-14 lg:max-w-5xl lg:px-10 lg:pt-12">
      <div className="h-4 w-36 animate-pulse rounded bg-fill" />
      <div className="h-9 w-56 animate-pulse rounded-lg bg-fill" />
      <div className="h-36 animate-pulse rounded-[20px] bg-card" />
      <div className="h-80 animate-pulse rounded-[24px] bg-card" />
    </main>
  );
}
