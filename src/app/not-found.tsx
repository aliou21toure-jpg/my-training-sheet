import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">Erreur 404</p>
      <h1 className="text-[28px] font-bold tracking-tight">Page introuvable</h1>
      <p className="text-[15px] text-text-muted">Cette adresse n’existe pas ou plus.</p>
      <Link href="/" className="min-h-11 py-2.5 text-[16px] font-semibold text-accent">Retour à l’accueil</Link>
    </main>
  );
}
