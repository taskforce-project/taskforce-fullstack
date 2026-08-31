"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { authService } from "@/lib/api/auth-service";
import { acceptInvitation } from "@/lib/api/invitation-service";
import { takeInvitationToken } from "@/lib/utils/pending-invitation";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { LoginIntro } from "@/components/layout/login-intro";

/**
 * Page de rappel de la connexion externe (GitHub / Google).
 *
 * Keycloak renvoie ici le navigateur avec `?code=…&state=…`. Cette page relaie le code à notre API,
 * qui seule détient le secret du client et peut l'échanger contre des jetons. Rien n'est décidé ici.
 *
 * <b>L'échange ne part qu'une fois</b> (garde par `ref` - le mode strict remonte l'effet en dev, et un
 * code d'autorisation est à usage unique).
 *
 * <b>Intro « ElevenLabs ».</b> Pendant l'échange on montre la 1ʳᵉ moitié de l'intro (le logo TaskForce
 * qui s'illumine, {@link LoginIntro} `phase="hold"`). Au succès on pose le drapeau `tf.intro` et on
 * navigue en dur (les stores Zustand se reconstruisent proprement) ; l'`AppShell` joue alors la 2ᵉ
 * moitié (vague + révélation) <b>en overlay pendant que l'app charge</b> - pas de loader, pas de
 * coupure. La frame de jointure (logo illuminé sur le fond de l'app) étant identique, le rechargement
 * est invisible.
 */
const MIN_HOLD_MS = 650;

function OAuthCallbackInner() {
  const params = useSearchParams();
  const { t } = usePreferencesStore();
  const [echecReseau, setEchecReseau] = useState<string | null>(null);
  const dejaEnvoye = useRef(false);
  const debut = useRef(0);

  const code = params.get("code");
  const state = params.get("state");

  // Refus du fournisseur (consentement annulé) ou réponse incomplète : déductibles de l'URL.
  const refusFournisseur =
    params.get("error_description") ??
    params.get("error") ??
    (!code || !state ? t.auth.ui.callbackIncomplete : null);

  const erreur = refusFournisseur ?? echecReseau;

  useEffect(() => {
    if (dejaEnvoye.current || refusFournisseur || !code || !state) return;
    dejaEnvoye.current = true;
    debut.current = Date.now();

    // La même URL de rappel qu'à l'autorisation : Keycloak la compare à l'octet près.
    const redirectUri = `${window.location.origin}/auth/callback`;

    authService
      .oauthCallback({ code, state, redirectUri })
      .then(async (auth) => {
        // Approbation explicite : la personne peut venir d'un lien d'invitation puis s'être connectée
        // via GitHub/Google. Le token mis de côté avant la redirection est appliqué maintenant
        // (best-effort - n'empêche jamais d'entrer).
        const invitationToken = takeInvitationToken();
        if (invitationToken) {
          try {
            await acceptInvitation(invitationToken);
          } catch {
            /* invitation invalide/expirée/déjà utilisée - la connexion reste valable */
          }
        }

        // Modèle Linear : un NOUVEAU venu (onboarding non fait) va au wizard ; un habitué à l'app.
        const target = auth?.user?.onboardingCompleted === false ? "/onboarding" : "/";

        // Drapeau consommé une fois par l'AppShell → joue la révélation en overlay. sessionStorage
        // survit au rechargement dans le même onglet.
        try {
          sessionStorage.setItem("tf.intro", "1");
        } catch {
          /* mode privé / stockage indisponible - on navigue quand même, sans révélation */
        }

        // Petit temps de présence du logo avant le rechargement, pour masquer la jointure.
        const reste = Math.max(0, MIN_HOLD_MS - (Date.now() - debut.current));
        window.setTimeout(() => window.location.replace(target), reste);
      })
      .catch((e: unknown) => {
        setEchecReseau(e instanceof Error ? e.message : t.auth.ui.callbackConnectFailed);
      });
  }, [code, state, refusFournisseur, t]);

  if (erreur) {
    return (
      <div className="auth-panel text-center">
        <AlertCircle className="mx-auto h-8 w-8" style={{ color: "var(--accent-red)" }} />
        <h1 className="auth-title mt-3">{t.auth.ui.callbackFailedTitle}</h1>
        <p className="auth-subtitle">{erreur}</p>
        <p className="mt-5 text-xs">
          <Link href="/auth/login" className="auth-link">
            {t.auth.ui.callbackBackToLogin}
          </Link>
        </p>
      </div>
    );
  }

  return <LoginIntro phase="hold" />;
}

/**
 * Enveloppe Suspense OBLIGATOIRE : `useSearchParams()` provoque un « CSR bailout » au prérendu
 * statique - sans cette frontière, `next build` échoue. Le fallback est le fond de l'app (l'intro
 * démarre dès les paramètres d'URL lus).
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-background" aria-hidden />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
