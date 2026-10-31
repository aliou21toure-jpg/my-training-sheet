export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-5 py-16">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">
        My Training Sheet
      </p>
      <h1 className="text-[32px] font-bold leading-tight tracking-tight">
        Le projet est initialisé.
      </h1>
      <p className="text-[15px] text-text-muted">
        Les écrans Today, Workout et Progress arrivent en semaine 2.
      </p>
    </main>
  );
}
