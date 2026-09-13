import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { startAnalytics } from "@/lib/analytics";
import { readConsent, writeConsent, CONSENT_OPEN_EVENT } from "@/lib/consent";

/**
 * Bandeau de consentement cookies de la landing (RGPD/CNIL). Cookies **nécessaires** exemptés ;
 * **analytics** (PostHog EU) en opt-in explicite. Actions : Accepter tout / Refuser / Personnaliser
 * (+ Enregistrer). S'affiche au 1er passage (aucun choix stocké) et se rouvre via `tf-consent-open`
 * (lien « Manage cookies » du footer) pour permettre la révocation à tout moment.
 *
 * Îlot `client:load` monté dans BaseLayout : c'est aussi lui qui initialise PostHog derrière le
 * consentement (`startAnalytics`), présent sur toutes les pages.
 */
export function CookieConsent() {
  // Client-only (lecture localStorage) : `mounted` évite tout écart d'hydratation (serveur=false).
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  // PostHog : init/anti-init derrière le consentement, ré-synchronisé à chaque changement de choix.
  useEffect(() => startAnalytics(), []);

  useEffect(() => {
    // Réouverture : setState dans le callback (pas dans le corps de l'effet).
    const onOpen = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setCustomize(true);
      setForceOpen(true);
    };
    // 1) Évènement programmatique (`openConsentPreferences()`).
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    // 2) Délégation : le footer est rendu en statique (SSR, non hydraté) donc son bouton
    //    « Manage cookies » ne porte pas d'onClick ; on l'intercepte ici via `[data-cookie-settings]`.
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-cookie-settings]")) {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
      document.removeEventListener("click", onClick);
    };
  }, []);

  if (!mounted) return null;
  // Ouverture DÉRIVÉE (pas de setState dans un effet) : 1er passage sans choix, ou réouverture manuelle.
  const open = forceOpen || (readConsent() === null && !dismissed);
  if (!open) return null;

  const decide = (allowAnalytics: boolean) => {
    writeConsent(allowAnalytics);
    setDismissed(true);
    setForceOpen(false);
    setCustomize(false);
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[60] w-[min(92vw,380px)] -translate-x-1/2"
      role="dialog"
      aria-label="Cookie consent"
    >
      <Card className="rounded-2xl border bg-background text-foreground shadow-lg">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">
                🍪
              </span>
              <h2 className="font-semibold">Cookies</h2>
            </div>
            <p className="text-muted-foreground text-sm">
              We use strictly necessary cookies to run this site, and - with your consent - analytics
              cookies to understand usage and improve the product. You choose.
            </p>

            {customize && (
              <div className="bg-muted/30 flex flex-col gap-3 rounded-lg border p-3">
                <label className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">Strictly necessary</span>
                    <span className="text-muted-foreground block text-xs">
                      Site delivery, security, preferences. Always on (exempt from consent).
                    </span>
                  </span>
                  <Switch checked disabled className="mt-0.5" aria-label="Strictly necessary cookies (always on)" />
                </label>
                <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">Analytics</span>
                    <span className="text-muted-foreground block text-xs">
                      PostHog (EU-hosted). Anonymous usage stats. No advertising.
                    </span>
                  </span>
                  <Switch
                    checked={analytics}
                    onCheckedChange={(v) => setAnalytics(v === true)}
                    className="mt-0.5"
                    aria-label="Analytics cookies"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <a
                href="/legal/privacy"
                className="hover:text-primary text-xs underline underline-offset-2"
              >
                Privacy policy
              </a>
              <div className="flex flex-wrap gap-2">
                {customize ? (
                  <Button size="sm" onClick={() => decide(analytics)}>
                    Save choices
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setCustomize(true)}>
                      Customize
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide(false)}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => decide(true)}>
                      Accept all
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
