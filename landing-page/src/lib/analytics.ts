import posthog from "posthog-js"

import { analyticsAllowed, CONSENT_EVENT } from "./consent"

/**
 * PostHog (EU) pour la landing, derrière le consentement. La clé PROJET (`phc_...`) est PUBLIQUE et
 * write-only (« safe to use in public apps » d'après PostHog) : défaut en dur acceptable, surchargé
 * par `PUBLIC_POSTHOG_KEY`. Région UE (`eu.i.posthog.com`) : aucune donnée hors UE. Sans clé, no-op.
 *
 * La landing est un site multi-pages classique (chaque navigation = un chargement complet), donc
 * PostHog capture les pageviews automatiquement à l'init - pas de pageview manuel comme dans l'app.
 */
const POSTHOG_KEY =
  import.meta.env.PUBLIC_POSTHOG_KEY ?? "phc_tmS4mL7gc9zKo35GyPtM5uGkBYoTU2y2cna9acz3kkBq"
const POSTHOG_HOST = import.meta.env.PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com"

let initialized = false

/**
 * Charge/active PostHog UNIQUEMENT si l'analytics est consenti. Aucun cookie analytics avant l'opt-in.
 * Sur retrait du consentement, coupe la capture (opt-out). Idempotent.
 */
export function syncPostHog(): void {
  if (typeof window === "undefined" || !POSTHOG_KEY) return
  if (!analyticsAllowed()) {
    if (initialized) {
      try {
        posthog.opt_out_capturing()
      } catch {
        /* déjà coupé */
      }
    }
    return
  }
  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage+cookie",
    })
    initialized = true
  } else {
    try {
      posthog.opt_in_capturing()
    } catch {
      /* déjà actif */
    }
  }
}

/**
 * Synchronise PostHog au montage puis à chaque changement de consentement. Renvoie une fonction de
 * nettoyage (retrait de l'écouteur) à appeler au démontage de l'îlot.
 */
export function startAnalytics(): () => void {
  syncPostHog()
  const onConsentChange = () => syncPostHog()
  window.addEventListener(CONSENT_EVENT, onConsentChange)
  return () => window.removeEventListener(CONSENT_EVENT, onConsentChange)
}
