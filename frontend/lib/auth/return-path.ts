/**
 * La page demandée avant la connexion (R161 M4 de #552) : la page de vérification d'un dossier, ou le lien du témoin qui
 * l'ouvre, que l'on reçoit dans une pull request. Sans session, l'app mène à la connexion ; une fois connectée, la personne
 * revient sur cette page au lieu de l'accueil. Elle attend dans le stockage de l'onglet le temps de la connexion (GitHub et
 * Google passent par leur site), comme la demande de l'app desktop.
 */

const STORAGE_KEY = "tf.returnTo";

/** Au-delà, une page oubliée dans l'onglet ne détourne plus une connexion ordinaire. */
const MAX_AGE_MS = 30 * 60_000;

/** Les seules pages qu'une connexion rend : celles de vérification, jamais une adresse venue d'ailleurs. */
const RETURNABLE = [/^\/verify\/[0-9a-f]{32}$/, /^\/[a-z0-9-]+\/missions\/\d+\/verification$/];

export function returnable(path: string): boolean {
  return RETURNABLE.some((pattern) => pattern.test(path));
}

/** Garde la page demandée, si c'en est une qu'une connexion rend. */
export function rememberReturnPath(path: string, now = Date.now()): void {
  if (!returnable(path)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path, savedAt: now }));
  } catch {
    /* stockage indisponible : la connexion reviendra à l'accueil */
  }
}

/** La page qui attend la connexion dans cet onglet, si elle est récente et bien formée ; elle reste jusqu'à l'arrivée. */
export function returnPath(now = Date.now()): string | null {
  let saved: { path?: unknown; savedAt?: unknown } | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    saved = raw ? (JSON.parse(raw) as { path?: unknown; savedAt?: unknown }) : null;
  } catch {
    saved = null;
  }
  if (!saved) return null;
  const { path, savedAt } = saved;
  if (typeof path !== "string" || typeof savedAt !== "number" || now - savedAt >= MAX_AGE_MS || !returnable(path)) {
    clearReturnPath();
    return null;
  }
  return path;
}

export function clearReturnPath(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* rien à effacer */
  }
}
