import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getDb } from "@/db/client";
import { getCalendar, parseIsoDate } from "@/features/calendar/get-calendar";
import { requireOwner } from "@/lib/auth/current-owner";

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <Suspense fallback={<main aria-busy="true" className="mx-auto w-full max-w-md px-4 pt-14"><div className="h-[520px] animate-pulse rounded-[22px] bg-card" /></main>}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) {
  await connection();
  const owner = await requireOwner();
  const params = await searchParams;
  const view = params.view === "month" ? "month" : "week";
  const data = await getCalendar(getDb(), owner.id, new Date(), view, parseIsoDate(params.d));
  // key: a new period resets the selection state.
  return <CalendarView key={`${data.view}-${data.anchor}`} data={data} />;
}
