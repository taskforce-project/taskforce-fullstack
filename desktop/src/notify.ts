/**
 * Notification du système pour un événement de TaskForce (ticket assigné, run terminé, validation demandée) reçu pendant
 * que la fenêtre n'est pas au premier plan : un clic ramène l'app au premier plan, sur la page de l'événement. Les
 * événements reçus sont ceux que les préférences de notification de la personne laissent passer dans l'app.
 */

/** Identifiant de l'app pour Windows (`appId` d'electron-builder.yml) : ses notifications portent son nom et son icône. */
export const APP_ID = "fr.taskforce-project.desktop";

export interface Notice {
  title: string;
  body: string;
  /** Page de l'app à ouvrir au clic (`/acme/projects/5/issues/12`), ou `null`. */
  path: string | null;
}

/** Chemin de l'app : commence par une seule barre oblique, sans espace ni barre oblique inverse. */
const APP_PATH = /^\/(?!\/)[^\s\\]{0,500}$/;

/** Notification demandée par la page, bornée et vérifiée : le clic n'ouvre qu'une page de l'app, jamais une adresse. */
export function readNotice(input: unknown): Notice | null {
  const { title, body, path } = (input ?? {}) as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim()) return null;
  return {
    title: title.trim().slice(0, 120),
    body: typeof body === "string" ? body.trim().slice(0, 300) : "",
    path: typeof path === "string" && APP_PATH.test(path) ? path : null,
  };
}
