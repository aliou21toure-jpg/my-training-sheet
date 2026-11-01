"use client";

import { useRouter } from "next/navigation";

export function ExercisePicker({ range, options, value }: { range: string; options: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1">
      <span className="sr-only">Exercice</span>
      <select
        value={value}
        onChange={(e) => router.push(`/progress?range=${range}&exercise=${e.target.value}`, { scroll: false })}
        className="h-11 w-full rounded-xl border-0 bg-fill px-3 text-[16px] font-semibold text-text outline-none ring-accent focus:ring-2"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}
