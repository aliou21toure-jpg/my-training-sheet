"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/(app)/settings/actions";
import { applyTheme, type ThemePreference } from "@/components/layout/theme-sync";
import type { OwnerSettings } from "@/features/settings/owner-settings";

const field = "h-11 w-full rounded-xl border-0 bg-fill px-3 text-[16px] text-text outline-none ring-accent focus:ring-2";

function Segmented<T extends string>({ name, label, value, options, onChange }: { name: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="px-1 pb-1.5 text-[13px] font-semibold text-text-muted">{label}</legend>
      <div className="grid gap-0.5 rounded-xl bg-fill p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label key={o.value} className={`flex h-10 cursor-pointer items-center justify-center rounded-[10px] text-[14px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${value === o.value ? "bg-card text-text shadow-sm" : "text-text-muted"}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsForm({ settings, timeZones }: { settings: OwnerSettings; timeZones: string[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, { status: "idle" });
  const [theme, setTheme] = useState<ThemePreference>(settings.theme);
  const [unit, setUnit] = useState(settings.unit);
  const [reminder, setReminder] = useState(settings.reminderEnabled);

  return (
    <form action={action} className="flex flex-col gap-6">
      <section aria-labelledby="s-profile" className="flex flex-col gap-2">
        <h2 id="s-profile" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Profil</h2>
        <div className="flex flex-col gap-1.5 rounded-[20px] bg-card p-4">
          <label htmlFor="displayName" className="px-1 text-[13px] font-semibold text-text-muted">Prénom affiché</label>
          <input id="displayName" name="displayName" defaultValue={settings.displayName ?? ""} maxLength={40} autoComplete="given-name" className={field} />
        </div>
      </section>

      <section aria-labelledby="s-display" className="flex flex-col gap-2">
        <h2 id="s-display" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Affichage</h2>
        <div className="flex flex-col gap-4 rounded-[20px] bg-card p-4">
          <Segmented
            name="theme"
            label="Thème"
            value={theme}
            onChange={(v) => {
              setTheme(v);
              applyTheme(v); // preview immediately
            }}
            options={[
              { value: "light", label: "Clair" },
              { value: "dark", label: "Sombre" },
              { value: "system", label: "Système" },
            ]}
          />
          <Segmented name="unit" label="Unité de poids" value={unit} onChange={setUnit} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
          <p className="px-1 text-[13px] text-text-muted">Les poids restent enregistrés en kg : changer d’unité ne modifie aucune donnée.</p>
        </div>
      </section>

      <section aria-labelledby="s-calendar" className="flex flex-col gap-2">
        <h2 id="s-calendar" className="px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Calendrier et rappels</h2>
        <div className="flex flex-col gap-4 rounded-[20px] bg-card p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone" className="px-1 text-[13px] font-semibold text-text-muted">Fuseau horaire (définit « aujourd’hui »)</label>
            <select id="timezone" name="timezone" defaultValue={settings.timezone} className={field}>
              {timeZones.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 px-1">
            <span className="text-[16px]">Rappel les jours d’entraînement</span>
            <input type="checkbox" name="reminderEnabled" checked={reminder} onChange={(e) => setReminder(e.target.checked)} className="size-6 accent-[var(--accent)]" />
          </label>
          {reminder && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reminderTime" className="px-1 text-[13px] font-semibold text-text-muted">Heure du rappel</label>
              <input id="reminderTime" name="reminderTime" type="time" defaultValue={settings.reminderTime ?? "18:00"} className={field} />
            </div>
          )}
          {!reminder && <input type="hidden" name="reminderTime" value={settings.reminderTime ?? ""} />}
        </div>
      </section>

      <div aria-live="polite" className="flex flex-col gap-2">
        {state.status === "error" && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-[14px] text-warn">{state.message}</p>}
        <button type="submit" disabled={pending} className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent disabled:opacity-60">
          {pending ? <LoaderCircle aria-hidden size={18} className="animate-spin" /> : state.status === "saved" ? <Check aria-hidden size={18} /> : null}
          {state.status === "saved" && !pending ? "Enregistré" : "Enregistrer les réglages"}
        </button>
      </div>
    </form>
  );
}
