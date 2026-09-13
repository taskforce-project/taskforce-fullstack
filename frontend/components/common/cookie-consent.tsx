"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { readConsent, writeConsent, CONSENT_OPEN_EVENT } from "@/lib/analytics/consent"

/**
 * Bandeau de consentement cookies (RGPD/CNIL). Cookies **nécessaires** toujours actifs (exemptés) ;
 * **analytics** (PostHog) en opt-in explicite. Actions : Accepter tout / Refuser / Personnaliser (+ Enregistrer).
 * S'affiche au 1er passage (aucun choix stocké) et se rouvre via l'évènement `tf-consent-open` (lien
 * « Manage cookies » du footer) pour permettre la révocation à tout moment.
 */
export function CookieConsent() {
  // Client-only (lecture localStorage) : `mounted` évite tout écart d'hydratation (serveur=false).
  const mounted = useSyncExternalStore(() => () => { }, () => true, () => false)
  const [dismissed, setDismissed] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)
  const [customize, setCustomize] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    // Réouverture depuis le footer (« Manage cookies ») : setState dans le callback (pas dans le corps de l'effet).
    const onOpen = () => {
      setAnalytics(readConsent()?.analytics ?? false)
      setCustomize(true)
      setForceOpen(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen)
  }, [])

  if (!mounted) return null
  // Ouverture DÉRIVÉE (pas de setState dans un effet) : 1er passage sans choix, ou réouverture manuelle.
  const open = forceOpen || (readConsent() === null && !dismissed)
  if (!open) return null

  const decide = (allowAnalytics: boolean) => {
    writeConsent(allowAnalytics)
    setDismissed(true)
    setForceOpen(false)
    setCustomize(false)
  }

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2"
      role="dialog"
      aria-label="Cookie consent"
    >
      <Card className="rounded-2xl border bg-background text-foreground shadow-lg">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">🍪</span>
              <h2 className="font-semibold">Cookies</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              We use strictly necessary cookies to keep you signed in, and - with your consent - analytics
              cookies to understand usage and improve the product. You choose.
            </p>

            {customize && (
              <div className="flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox checked disabled className="mt-0.5" />
                  <span>
                    <span className="font-medium">Strictly necessary</span>
                    <span className="block text-xs text-muted-foreground">Sign-in, security, UI preferences. Always on (exempt from consent).</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox checked={analytics} onCheckedChange={(v) => setAnalytics(v === true)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">Analytics</span>
                    <span className="block text-xs text-muted-foreground">PostHog (EU-hosted). Anonymous usage stats. No advertising.</span>
                  </span>
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Link href="/privacy-policy" className="text-xs underline underline-offset-2 hover:text-primary">
                Privacy policy
              </Link>
              <div className="flex flex-wrap gap-2">
                {customize ? (
                  <Button size="sm" onClick={() => decide(analytics)}>Save choices</Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setCustomize(true)}>Customize</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(false)}>Reject</Button>
                    <Button size="sm" onClick={() => decide(true)}>Accept all</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
