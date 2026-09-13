"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import posthog from "posthog-js"

import { analyticsAllowed, CONSENT_EVENT } from "@/lib/analytics/consent"

// Cle PUBLIQUE PostHog (client-side, `phc_...`) + hote UE. Bakees au build (NEXT_PUBLIC_*). Sans cle,
// l'analytics ne charge jamais (le composant devient un no-op) : rien a casser tant que le projet
// PostHog n'est pas cree.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com"

let initialized = false

/**
 * Charge/active PostHog UNIQUEMENT si l'analytics est consenti. Aucun cookie analytics n'est pose avant
 * l'opt-in. Sur retrait du consentement, coupe la capture (opt-out). Idempotent.
 */
function syncPostHog(): void {
  if (!POSTHOG_KEY) return
  if (!analyticsAllowed()) {
    if (initialized) {
      try { posthog.opt_out_capturing() } catch { /* deja coupe */ }
    }
    return
  }
  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: false, // App Router : on capture le pageview manuellement (ci-dessous)
      capture_pageleave: true,
      persistence: "localStorage+cookie",
    })
    initialized = true
  } else {
    try { posthog.opt_in_capturing() } catch { /* deja actif */ }
  }
}

/**
 * Monte au niveau racine (rend `null`). Initialise PostHog derriere le consentement et envoie un
 * `$pageview` a chaque navigation App Router.
 */
export function PostHogProvider() {
  const pathname = usePathname()

  useEffect(() => {
    syncPostHog()
    const onConsentChange = () => syncPostHog()
    window.addEventListener(CONSENT_EVENT, onConsentChange)
    return () => window.removeEventListener(CONSENT_EVENT, onConsentChange)
  }, [])

  useEffect(() => {
    if (!POSTHOG_KEY || !initialized || !analyticsAllowed()) return
    try {
      posthog.capture("$pageview", { $current_url: window.location.href })
    } catch {
      /* capture best-effort */
    }
  }, [pathname])

  return null
}
