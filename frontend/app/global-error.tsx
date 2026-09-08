"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-logger";

/**
 * Filet de derniere ligne : capture une erreur survenue dans le root layout LUI-MEME
 * ou au-dessus de l'ErrorBoundary (ThemeProvider, I18nProvider...). Next.js remplace alors
 * tout le document -> ce composant DOIT rendre ses propres <html>/<body>, et ne peut pas
 * s'appuyer sur les providers ni le CSS de l'app. On style donc en inline, sobre et brande.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    reportClientError(
      "error",
      error.message || "Global error",
      `global-error.tsx${error.digest ? " digest=" + error.digest : ""}`,
      error.stack,
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0c",
          color: "#e5e5e5",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            padding: 24,
            maxWidth: 420,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              opacity: 0.85,
            }}
          >
            TaskForce
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.7, margin: 0 }}>
            An unexpected error occurred. Try reloading the page.
            {error.digest ? ` (ref: ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 4,
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
