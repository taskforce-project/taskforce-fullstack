import { useEffect, useState, useSyncExternalStore } from "react";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { startAnalytics } from "@/lib/analytics";
import { readConsent, writeConsent, CONSENT_OPEN_EVENT } from "@/lib/consent";

/**
 * Bandeau de consentement cookies de la landing (RGPD/CNIL). Cookies **nécessaires** exemptés ;
 * **analytics** (PostHog EU) en opt-in explicite. Actions : Accept all / Reject all / Manage (déplie
 * les catégories) / Save. S'affiche au 1er passage et se rouvre via `tf-consent-open` (lien « Manage
 * cookies » du footer) pour permettre la révocation à tout moment.
 *
 * Îlot `client:load` monté dans BaseLayout : c'est aussi lui qui initialise PostHog derrière le
 * consentement (`startAnalytics`). Design aligné sur l'app (carte d'angle, switches, entrée animée).
 */
export function CookieConsent() {
  // Client-only (lecture localStorage) : `mounted` évite tout écart d'hydratation (serveur=false).
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  // PostHog : init/anti-init derrière le consentement, ré-synchronisé à chaque changement de choix.
  useEffect(() => startAnalytics(), []);

  useEffect(() => {
    // Réouverture : setState dans le callback (pas dans le corps de l'effet).
    const onOpen = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setExpanded(true);
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
    setExpanded(false);
  };

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label="Cookie preferences"
      className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-300 motion-reduce:animate-none"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold tracking-[-0.01em]">
          <Cookie aria-hidden className="text-muted-foreground size-4" />
          We use cookies
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Necessary cookies keep this site running. With your consent, we also use PostHog (EU-hosted)
          analytics to understand usage and improve the product.{" "}
          <a
            href="/legal/privacy"
            className="text-foreground hover:text-primary underline underline-offset-4"
          >
            Privacy policy
          </a>
        </p>
      </div>

      {expanded && (
        <div className="bg-background flex flex-col divide-y rounded-md border">
          <Field orientation="horizontal" className="justify-between gap-4 p-3">
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor="cc-necessary" className="items-center gap-2">
                Necessary
                <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.08em]">
                  Always on
                </span>
              </FieldLabel>
              <FieldDescription className="text-xs">
                Site delivery, security, and remembering this choice.
              </FieldDescription>
            </FieldContent>
            <Switch id="cc-necessary" checked disabled aria-label="Necessary cookies (always on)" />
          </Field>
          <Field orientation="horizontal" className="justify-between gap-4 p-3">
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor="cc-analytics">Analytics</FieldLabel>
              <FieldDescription className="text-xs">
                Page views and usage, aggregated. PostHog, EU-hosted. No advertising.
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
            className="text-muted-foreground ms-auto"
            onClick={() => setExpanded(true)}
          >
            Manage
          </Button>
        )}
      </div>
    </div>
  );
}
