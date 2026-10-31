import type { LucideIcon } from "lucide-react";

/** Honest placeholder for screens of later steps (no fake data). */
export function ComingSoon({ title, step, icon: Icon }: { title: string; step: string; icon: LucideIcon }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-[max(env(safe-area-inset-top),3.5rem)] lg:max-w-3xl lg:px-10 lg:pt-12">
      <h1 className="px-1 text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
      <section className="flex flex-col items-center gap-3 rounded-[24px] bg-card px-6 py-10 text-center">
        <Icon aria-hidden size={36} strokeWidth={1.6} className="text-accent" />
        <p className="text-[17px] font-semibold">Bientôt disponible</p>
        <p className="max-w-xs text-[15px] text-text-muted">Cet écran arrive à l’étape « {step} » du plan.</p>
      </section>
    </main>
  );
}
