/**
 * Utilitaires pour gérer les données d'inscription temporaires
 * Les données sont stockées dans sessionStorage pendant le processus d'inscription
 */

export type RegisterData = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /**
   * Jeton de vérification humaine. Émis et validé par la case cochée à l'étape 1, mais consommé à
   * l'étape 2, seul moment où l'inscription est réellement envoyée au serveur : il doit donc
   * traverser jusqu'à la vérification.
   */
  challengeToken?: string;
  /** Jeton Cloudflare Turnstile - même trajet que le défi signé : émis étape 1, consommé étape 2. */
  turnstileToken?: string;
};

const REGISTER_DATA_KEY = "registerData";

/**
 * Récupère les données d'inscription depuis sessionStorage
 */
export function getRegisterData(): RegisterData | null {
  if (globalThis.window === undefined) return null;

  const data = sessionStorage.getItem(REGISTER_DATA_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Sauvegarde les données d'inscription dans sessionStorage
 */
export function setRegisterData(data: Partial<RegisterData>): void {
  if (globalThis.window === undefined) return;

  const existing = getRegisterData() || {};
  const updated = { ...existing, ...data };
  sessionStorage.setItem(REGISTER_DATA_KEY, JSON.stringify(updated));
}

/**
 * Supprime les données d'inscription de sessionStorage
 */
export function clearRegisterData(): void {
  if (globalThis.window === undefined) return;
  sessionStorage.removeItem(REGISTER_DATA_KEY);
}

/**
 * Vérifie si les données d'inscription existent
 */
export function hasRegisterData(): boolean {
  return getRegisterData() !== null;
}
