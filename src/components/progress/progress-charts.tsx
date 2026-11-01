"use client";

/**
 * Charts of the Progress screen. One series each (no legend: the title
 * names it), thin marks, recessive grid, hover tooltips, a data table for
 * screen readers. Missing values are gaps, never zeros.
 */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { metricUnit, valueOf, type ExercisePoint, type Metric, type WeekBar } from "@/features/progress/metrics";
import { toDisplayWeight, type WeightUnit } from "@/lib/units";

const AXIS = { fontSize: 12, fill: "var(--text-muted)" };
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fr = (n: number) => String(n).replace(".", ",");

function display(metric: Metric, v: number | null, unit: WeightUnit) {
  return v === null ? null : metric === "weight" ? toDisplayWeight(v, unit) : v;
}

function TooltipCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-[13px] shadow-lg">
      <p className="font-semibold text-text">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-text-muted">{l}</p>
      ))}
    </div>
  );
}

export function ExerciseChart({ points, metric, unit, name }: { points: ExercisePoint[]; metric: Metric; unit: WeightUnit; name: string }) {
  const data = points.map((p) => ({ ...p, label: shortDate(p.date), value: display(metric, valueOf(p, metric), unit) }));
  const u = metricUnit(metric, unit);

  return (
    <figure className="flex flex-col gap-2">
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} allowDecimals={metric === "weight"} />
            <Tooltip
              cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                if (!p) return null;
                const lines = [
                  p.value === null ? "Non renseigné" : `${fr(p.value)} ${u}${metric === "weight" && p.repsAtMax !== null ? ` × ${p.repsAtMax}` : ""}`,
                  `${p.sets} série${p.sets > 1 ? "s" : ""}`,
                ];
                if (p.volumeKg !== null) lines.push(`Volume ${fr(toDisplayWeight(p.volumeKg, unit))} ${unit}`);
                return <TooltipCard title={p.label} lines={lines} />;
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 4, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="px-1 text-[13px] text-text-muted">
        <summary className="cursor-pointer font-semibold">Voir les données</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <caption className="sr-only">{name} : meilleure valeur par séance</caption>
          <thead>
            <tr><th className="py-1 font-semibold">Date</th><th className="py-1 font-semibold">Meilleure valeur</th><th className="py-1 font-semibold">Séries</th></tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.sessionId} className="border-t border-line">
                <td className="py-1">{p.label}</td>
                <td className="py-1">{p.value === null ? "—" : `${fr(p.value)} ${u}${metric === "weight" && p.repsAtMax !== null ? ` × ${p.repsAtMax}` : ""}`}</td>
                <td className="py-1">{p.sets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function WeeklyChart({ weeks }: { weeks: WeekBar[] }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="h-40 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip
              cursor={{ fill: "var(--fill)" }}
              content={({ active, payload }) => {
                const w = active ? (payload?.[0]?.payload as WeekBar | undefined) : undefined;
                if (!w) return null;
                return <TooltipCard title={`Semaine du ${w.label}`} lines={[`${w.completed} séance${w.completed > 1 ? "s" : ""}${w.planned ? ` sur ${w.planned} prévue${w.planned > 1 ? "s" : ""}` : ""}`]} />;
              }}
            />
            <Bar dataKey="completed" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="px-1 text-[13px] text-text-muted">
        <summary className="cursor-pointer font-semibold">Voir les données</summary>
        <ul className="mt-2">
          {weeks.map((w) => (
            <li key={w.weekStart}>Semaine du {w.label} : {w.completed} / {w.planned || "—"}</li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
