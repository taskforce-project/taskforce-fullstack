/**
 * Consentement cookies (RGPD/CNIL). Modèle à catégories : les cookies **nécessaires** (auth, préférence
 * d'UI) sont toujours actifs et exemptés de consentement ; la catégorie **analytics** (PostHog) est en
 * **opt-in** - aucun cookie analytics n'est posé tant que l'utilisateur n'a pas accepté.
 *
 * Le choix est persisté en `localStorage` (versionné : bumper {@link CONSENT_VERSION} re-demande le
 * consentement si la politique change). Deux évènements fenêtre coordonnent l'UI et le chargeur d'analytics :
 * `tf-consent-change` (le choix a changé) et `tf-consent-open` (rouvrir le panneau, ex. depuis le footer).
 */

export const CONSENT_STORAGE_KEY = "tf-cookie-consent"
/** v1 = ancienne notice « acknowledged » (chaîne) -> invalide ici -> on redemande le consentement. */
export const CONSENT_VERSION = 2

export const CONSENT_EVENT = "tf-consent-change"
export const CONSENT_OPEN_EVENT = "tf-consent-open"

export interface CookieConsent {
  /** Cookies analytics (PostHog) autorisés. Les cookies nécessaires sont toujours actifs (non listés). */
  analytics: boolean
  /** Version de politique au moment du choix. */
  v: number
  /** Horodatage du choix (preuve de consentement). */
  ts: number
}

/** Lit le choix stocké, ou `null` si aucun choix valide (jamais demandé, invalide, ou politique périmée). */
export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CookieConsent>
    if (typeof parsed?.analytics !== "boolean" || parsed?.v !== CONSENT_VERSION) return null
    return { analytics: parsed.analytics, v: CONSENT_VERSION, ts: typeof parsed.ts === "number" ? parsed.ts : 0 }
  } catch {
    return null
  }
}

/** Enregistre le choix + notifie (`tf-consent-change`). Renvoie le choix persisté. */
export function writeConsent(analytics: boolean): CookieConsent {
  const choice: CookieConsent = { analytics, v: CONSENT_VERSION, ts: Date.now() }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice))
  } catch {
    /* stockage indisponible (navigation privée) : le choix vaut au moins pour la session courante */
  }
  try {
    window.dispatchEvent(new CustomEvent<CookieConsent>(CONSENT_EVENT, { detail: choice }))
  } catch {
    /* pas de window (SSR) : sans effet */
  }
  return choice
}

/** True si l'analytics est explicitement autorisé (opt-in). Défaut = false (pas de choix -> pas de cookie). */
export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true
}

/** Rouvre le panneau de préférences (révocation/modification depuis le footer). */
export function openConsentPreferences(): void {
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT))
  } catch {
    /* pas de window : sans effet */
  }
}
