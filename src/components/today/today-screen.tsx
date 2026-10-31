import { WEEKDAY_LABELS } from "@/features/import/format";
import type { TodayView } from "@/features/today/get-today";
import { TodayCard } from "./today-card";
import { WeekStrip } from "./week-strip";

const SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function TodayScreen({ view, startKey }: { view: TodayView; startKey: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] sm:px-5 lg:max-w-5xl lg:px-10 lg:pt-12">
      <header className="flex flex-col gap-1 px-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">{view.dateLabel}</p>
        <h1 className="text-[32px] font-bold leading-[38px] tracking-tight">
          {view.greeting}
          {view.displayName ? `, ${view.displayName}` : ""}
        </h1>
      </header>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="order-2 lg:order-1">
          <TodayCard view={view} startKey={startKey} />
        </div>

        <div className="order-1 flex flex-col gap-5 lg:order-2">
          <WeekStrip week={view.week} completed={view.completedThisWeek} planned={view.plannedThisWeek} />

          {view.upcoming.length > 0 && (
            <section aria-label="À venir" className="hidden flex-col gap-2.5 lg:flex">
              <UpcomingList view={view} />
            </section>
          )}
        </div>

        {view.upcoming.length > 0 && (
          <section aria-label="À venir" className="order-3 flex flex-col gap-2.5 lg:hidden">
            <UpcomingList view={view} />
          </section>
        )}
      </div>
    </main>
  );
}

function UpcomingList({ view }: { view: TodayView }) {
  return (
    <>
      <h2 className="px-1 text-[20px] font-bold tracking-tight">À venir</h2>
      <ul className="overflow-hidden rounded-[20px] bg-card">
        {view.upcoming.map((d, i) => (
          <li key={d.isoDate} className={`flex items-center gap-3.5 px-4 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}>
            <div
              aria-hidden
              className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-xl ${
                d.kind === "rest" ? "bg-fill text-text-muted" : "bg-accent-soft text-accent"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase">{SHORT[d.weekday - 1]}</span>
              <span className={`text-[17px] font-bold leading-[18px] ${d.kind === "rest" ? "text-text" : ""}`}>{d.dayOfMonth}</span>
            </div>
            <div className="min-w-0">
              <p className="sr-only">{WEEKDAY_LABELS[d.weekday - 1]} {d.dayOfMonth} :</p>
              <p className="truncate text-[16px] font-semibold">{d.title}</p>
              <p className="line-clamp-2 text-[14px] leading-snug text-text-muted">{d.subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
