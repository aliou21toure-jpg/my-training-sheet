import type { WeekDay, WeekDayStatus } from "@/features/today/get-today";

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const STATUS_LABEL: Record<WeekDayStatus, string> = {
  done: "séance faite",
  today: "aujourd’hui",
  planned: "séance prévue",
  missed: "séance non faite",
  recovery: "récupération",
  rest: "repos",
  none: "",
};

function circleClass(day: WeekDay): string {
  const ring = day.isToday ? " ring-2 ring-accent ring-inset" : "";
  switch (day.status) {
    case "done":
      return `bg-accent text-on-accent${day.isToday ? " ring-2 ring-accent ring-offset-2 ring-offset-card" : ""}`;
    case "recovery":
      return `bg-accent-soft text-accent${ring}`;
    case "today":
    case "planned":
      return `text-accent${ring}`;
    case "missed":
      return "text-text-muted line-through decoration-1";
    default:
      return `text-text-muted${ring}`;
  }
}

export function WeekStrip({ week, completed, planned }: { week: WeekDay[]; completed: number; planned: number }) {
  return (
    <section aria-label="Cette semaine" className="flex flex-col gap-3.5 rounded-[20px] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-none">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold">Cette semaine</h2>
        <p className="text-[15px] text-text-muted">
          <span className="font-semibold text-text tabular-nums">{completed}</span> / {planned} séances
        </p>
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {week.map((day, i) => (
          <li key={day.isoDate} className="flex flex-col items-center gap-1.5">
            <span aria-hidden className={`text-[12px] font-semibold ${day.isToday ? "text-accent" : "text-text-muted"}`}>
              {LETTERS[i]}
            </span>
            <span
              className={`flex size-[38px] items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${circleClass(day)}`}
            >
              {day.dayOfMonth}
              <span className="sr-only">
                {" "}
                {STATUS_LABEL[day.status]}
                {day.isToday && day.status !== "today" ? ", aujourd’hui" : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="flex flex-wrap gap-4 text-[12px] text-text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />Faite</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent-soft ring-1 ring-accent/40" />Récupération</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full ring-[1.5px] ring-accent ring-inset" />Prévue</span>
      </div>
    </section>
  );
}
