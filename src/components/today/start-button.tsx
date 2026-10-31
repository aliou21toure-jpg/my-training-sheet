"use client";

import { LoaderCircle, Play } from "lucide-react";
import { useFormStatus } from "react-dom";
import { startWorkoutAction } from "@/app/(app)/workout/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent transition-transform active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? <LoaderCircle aria-hidden size={18} className="animate-spin" /> : <Play aria-hidden size={18} fill="currentColor" strokeWidth={0} />}
      {label}
    </button>
  );
}

/**
 * Starts today's workout. The key (created once on the server for this
 * screen) makes a double tap start one session, not two.
 */
export function StartButton({ startKey, option, label = "Commencer la séance" }: { startKey: string; option?: number; label?: string }) {
  return (
    <form action={startWorkoutAction}>
      <input type="hidden" name="key" value={startKey} />
      {option !== undefined && <input type="hidden" name="option" value={option} />}
      <Submit label={label} />
    </form>
  );
}
