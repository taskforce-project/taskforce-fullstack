import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  CONSENT_EVENT,
  CONSENT_OPEN_EVENT,
  readConsent,
  writeConsent,
  analyticsAllowed,
  openConsentPreferences,
} from "./consent"

// Le setup global (vitest.setup.ts) remplace localStorage par des vi.fn() NON persistants ; on installe
// ici un vrai stockage Map-backed pour tester le round-trip get/set.
function installPersistentLocalStorage() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
  vi.stubGlobal("localStorage", mock)
}

describe("analytics/consent", () => {
  beforeEach(() => {
    installPersistentLocalStorage()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("readConsent: null quand aucun choix", () => {
    expect(readConsent()).toBeNull()
  })

  it("readConsent: null quand la valeur est l'ancienne notice (chaine)", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "acknowledged")
    expect(readConsent()).toBeNull()
  })

  it("readConsent: null quand la version de politique est perimee", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, v: 1, ts: 1 }))
    expect(readConsent()).toBeNull()
  })

  it("writeConsent: persiste le choix (v courante + horodatage) et emet l'evenement", () => {
    const spy = vi.fn()
    window.addEventListener(CONSENT_EVENT, spy)
    const choice = writeConsent(true)
    expect(choice.analytics).toBe(true)
    expect(choice.v).toBe(CONSENT_VERSION)
    expect(choice.ts).toBeGreaterThan(0)
    expect(readConsent()).toEqual(choice)
    expect(spy).toHaveBeenCalledOnce()
    window.removeEventListener(CONSENT_EVENT, spy)
  })

  it("analyticsAllowed: true seulement apres opt-in explicite", () => {
    expect(analyticsAllowed()).toBe(false)
    writeConsent(false)
    expect(analyticsAllowed()).toBe(false)
    writeConsent(true)
    expect(analyticsAllowed()).toBe(true)
  })

  it("openConsentPreferences: emet l'evenement d'ouverture", () => {
    const spy = vi.fn()
    window.addEventListener(CONSENT_OPEN_EVENT, spy)
    openConsentPreferences()
    expect(spy).toHaveBeenCalledOnce()
    window.removeEventListener(CONSENT_OPEN_EVENT, spy)
  })
})
