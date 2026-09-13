/**
 * Consentement cookies de la landing (RGPD/CNIL) - miroir de l'app. Cookies nécessaires exemptés ;
 * catégorie analytics (PostHog EU) en opt-in. Choix versionné en localStorage ; évènements fenêtre
 * `tf-consent-change` (choix modifié) et `tf-consent-open` (rouvrir le panneau depuis le footer).
 */
export const CONSENT_STORAGE_KEY = "tf-cookie-consent"
export const CONSENT_VERSION = 2
export const CONSENT_EVENT = "tf-consent-change"
export const CONSENT_OPEN_EVENT = "tf-consent-open"

export interface CookieConsent {
  analytics: boolean
  v: number
  ts: number
}

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

export function writeConsent(analytics: boolean): CookieConsent {
  const choice: CookieConsent = { analytics, v: CONSENT_VERSION, ts: Date.now() }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice))
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  try {
    window.dispatchEvent(new CustomEvent<CookieConsent>(CONSENT_EVENT, { detail: choice }))
  } catch {
    /* pas de window */
  }
  return choice
}

export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true
}

export function openConsentPreferences(): void {
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT))
  } catch {
    /* pas de window */
  }
}
