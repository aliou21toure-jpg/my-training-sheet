import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeRedirectPath } from "@/features/auth/sign-in";

export const metadata: Metadata = { title: "Connexion · My Training Sheet" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <header className="flex flex-col gap-1 px-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">My Training Sheet</p>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">Connexion</h1>
        <p className="text-[15px] text-text-muted">Application privée, un seul compte.</p>
      </header>
      <Suspense>
        <FormWithNext searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function FormWithNext({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const next = safeRedirectPath((await searchParams).next);
  return <SignInForm next={next} />;
}
