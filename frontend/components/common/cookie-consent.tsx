"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Cookie } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { readConsent, writeConsent, CONSENT_OPEN_EVENT } from "@/lib/analytics/consent"

/**
 * Bandeau de consentement cookies (RGPD/CNIL). Cookies **nécessaires** toujours actifs (exemptés) ;
 * **analytics** (PostHog EU) en opt-in explicite. Actions : Accept all / Reject all / Manage (déplie
 * les catégories) / Save. S'affiche au 1er passage (aucun choix stocké) et se rouvre via l'évènement
 * `tf-consent-open` (lien « Manage cookies » du footer) pour permettre la révocation à tout moment.
 *
 * Carte d'angle bas-droite (le sidebar occupe la gauche), switches par catégorie, entrée animée.
 */
export function CookieConsent() {
  // Client-only (lecture localStorage) : `mounted` évite tout écart d'hydratation (serveur=false).
  const mounted = useSyncExternalStore(() => () => { }, () => true, () => false)
  const [dismissed, setDismissed] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    // Réouverture depuis le footer (« Manage cookies ») : setState dans le callback (pas dans le corps de l'effet).
    const onOpen = () => {
      setAnalytics(readConsent()?.analytics ?? false)
      setExpanded(true)
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
    setExpanded(false)
  }

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label="Cookie preferences"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-300 motion-reduce:animate-none"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-foreground">
          <Cookie aria-hidden className="size-4 text-muted-foreground" />
          We use cookies
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Necessary cookies keep you signed in. With your consent, we also use PostHog (EU-hosted)
          analytics to understand usage and improve the product.{" "}
          <Link
            href="/privacy-policy"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Privacy policy
          </Link>
        </p>
      </div>

      {expanded && (
        <div className="flex flex-col divide-y rounded-md border bg-background">
          <Field orientation="horizontal" className="justify-between gap-4 p-3">
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor="cc-necessary" className="items-center gap-2">
                Necessary
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Always on
                </span>
              </FieldLabel>
              <FieldDescription className="text-xs">
                Sign-in, security, and remembering this choice.
              </FieldDescription>
            </FieldContent>
            <Switch id="cc-necessary" checked disabled aria-label="Necessary cookies (always on)" />
          </Field>
          <Field orientation="horizontal" className="justify-between gap-4 p-3">
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor="cc-analytics">Analytics</FieldLabel>
              <FieldDescription className="text-xs">
                Page views and feature usage, aggregated. PostHog, EU-hosted. No advertising.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="cc-analytics"
              checked={analytics}
              onCheckedChange={(v) => setAnalytics(v === true)}
              aria-label="Analytics cookies"
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => decide(true)}>
          Accept all
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide(false)}>
          Reject all
        </Button>
        {expanded ? (
          <Button size="sm" variant="outline" onClick={() => decide(analytics)}>
            Save choices
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="ms-auto text-muted-foreground"
            onClick={() => setExpanded(true)}
          >
            Manage
          </Button>
        )}
      </div>
    </div>
  )
}
