"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { signInAction, type SignInState } from "@/app/(auth)/sign-in/actions";

const initialState: SignInState = { error: null };

const fieldClass =
  "h-12 w-full rounded-xl border-0 bg-fill px-4 text-[17px] text-text outline-none ring-accent placeholder:text-text-muted focus:ring-2";

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[22px] bg-card p-5">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="px-1 text-[13px] font-semibold text-text-muted">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="px-1 text-[13px] font-semibold text-text-muted">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClass}
        />
      </div>
      <div aria-live="polite" className="min-h-0">
        {state.error && (
          <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2.5 text-[15px] text-warn">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent transition-opacity disabled:opacity-50"
      >
        {pending && <LoaderCircle aria-hidden size={18} className="animate-spin" />}
        Se connecter
      </button>
    </form>
  );
}
