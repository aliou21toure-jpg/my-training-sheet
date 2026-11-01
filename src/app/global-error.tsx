"use client";

/** Last resort if the root layout itself fails. Plain HTML: the app CSS may be unavailable. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "-apple-system, system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <h1>Une erreur est survenue</h1>
        <p>Réessaie dans un instant.</p>
        <button type="button" onClick={reset} style={{ padding: "12px 20px", fontSize: 16 }}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
