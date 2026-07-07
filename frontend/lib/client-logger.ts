import { WORKSPACE_ROUTES } from "@/lib/config/api-routes";

/**
 * Journalisation « classique » des erreurs client (E25) — best-effort, non bloquant.
 *
 * Remonte les erreurs (window.onerror, rejets non gérés, ErrorBoundary) vers l'endpoint serveur
 * `POST /api/logs/client` qui les écrit dans les logs applicatifs (Slf4j → OTEL/SigNoz).
 * L'endpoint est authentifié : on n'envoie donc **que si un token est présent** (pré-login = console
 * seulement). Throttle + dédup pour éviter le flooding, et on avale toute erreur (jamais de boucle).
 */

const THROTTLE_MS = 10_000;
const lastSent = new Map<string, number>();

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
}

type ClientLevel = "error" | "warn";

export function reportClientError(
  level: ClientLevel,
  message: string,
  source?: string,
  stack?: string,
): void {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("accessToken");
  if (!token) return; // endpoint authentifié → on ignore hors session

  // Dédup / throttle par (niveau + début du message).
  const key = `${level}|${message.slice(0, 120)}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) + THROTTLE_MS > now) return;
  lastSent.set(key, now);

  try {
    void fetch(`${apiBase()}${WORKSPACE_ROUTES.CLIENT_LOG}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        level,
        message: message.slice(0, 2000),
        source: source?.slice(0, 512),
        stack: stack?.slice(0, 8000),
        userAgent: navigator.userAgent.slice(0, 512),
      }),
      keepalive: true, // survit à un unload de page
    }).catch(() => { /* best-effort */ });
  } catch { /* best-effort */ }
}

let initialized = false;

/** Installe les handlers globaux (une seule fois). À appeler côté client au montage de l'app. */
export function initClientLogger(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    reportClientError("error", e.message || "window.onerror", e.filename, e.error?.stack);
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    reportClientError(
      "error",
      reason?.message ? `Unhandled rejection: ${reason.message}` : "Unhandled promise rejection",
      window.location?.pathname,
      reason?.stack,
    );
  });
}
