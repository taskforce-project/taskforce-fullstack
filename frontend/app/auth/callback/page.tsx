"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { authService } from "@/lib/api/auth-service";
import { acceptInvitation } from "@/lib/api/invitation-service";
import { takeInvitationToken } from "@/lib/utils/pending-invitation";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { CortexAwakening } from "@/components/auth/cortex-awakening";

/**
 * Page de rappel de la connexion externe (GitHub / Google).
 *
 * Keycloak renvoie ici le navigateur avec `?code=…&state=…`. Cette page relaie le code à notre API,
 * qui seule détient le secret du client et peut l'échanger contre des jetons. Rien n'est décidé ici.
 *
 * <b>L'échange ne part qu'une fois.</b> Un code d'autorisation est à usage unique : un remontage de
 * l'effet (mode strict en dev) rejouerait l'appel et afficherait une erreur sur une connexion pourtant
 * réussie. D'où le garde par `ref`.
 *
 * <b>L'animation EST la transition.</b> Pendant l'échange, on joue l'intro « Cortex awakening »
 * (cf. {@link CortexAwakening}) : 1ʳᵉ connexion → cinématique complète, ensuite → micro-animation
 * (mémorisé en local). On navigue quand l'intro est finie <i>et</i> la session prête — pas d'écran de
 * chargement intercalé. La navigation est <b>dure</b> (le service a écrit jetons + profil ; un
 * rechargement complet reconstruit proprement les stores Zustand singletons).
 */
function OAuthCallbackInner() {
  const params = useSearchParams();
  const { t } = usePreferencesStore();
  const [echecReseau, setEchecReseau] = useState<string | null>(null);
  const [animDone, setAnimDone] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const dejaEnvoye = useRef(false);

  // 1ʳᵉ connexion → cinématique complète ; ensuite → micro. Mémorisé localement (best-effort).
  const [variant] = useState<"full" | "micro">(() => {
    if (typeof window === "undefined") return "full";
    try {
      const seen = localStorage.getItem("tf.cortex.intro.seen");
      localStorage.setItem("tf.cortex.intro.seen", "1");
      return seen ? "micro" : "full";
    } catch {
      return "full";
    }
  });

  const code = params.get("code");
  const state = params.get("state");

  // Refus du fournisseur (consentement annulé) ou réponse incomplète : entièrement déductibles de l'URL.
  const refusFournisseur =
    params.get("error_description") ??
    params.get("error") ??
    (!code || !state ? t.auth.ui.callbackIncomplete : null);

  const erreur = refusFournisseur ?? echecReseau;

  // Échange du code contre les jetons — une seule fois.
  useEffect(() => {
    if (dejaEnvoye.current || refusFournisseur || !code || !state) return;
    dejaEnvoye.current = true;

    // La même URL de rappel qu'à l'autorisation : Keycloak la compare à l'octet près.
    const redirectUri = `${window.location.origin}/auth/callback`;

    authService
      .oauthCallback({ code, state, redirectUri })
      .then(async (auth) => {
        // Approbation explicite : la personne peut venir d'un lien d'invitation puis s'être connectée
        // via GitHub/Google. Le token mis de côté avant la redirection est appliqué maintenant
        // (best-effort — n'empêche jamais d'entrer).
        const invitationToken = takeInvitationToken();
        if (invitationToken) {
          try {
            await acceptInvitation(invitationToken);
          } catch {
            /* invitation invalide/expirée/déjà utilisée — la connexion reste valable */
          }
        }

        // Modèle Linear : un NOUVEAU venu (onboarding non fait) va au wizard ; un habitué à l'app.
        setTarget(auth?.user?.onboardingCompleted === false ? "/onboarding" : "/");
      })
      .catch((e: unknown) => {
        setEchecReseau(e instanceof Error ? e.message : t.auth.ui.callbackConnectFailed);
      });
  }, [code, state, refusFournisseur, t]);

  // On part vers l'app quand l'intro est finie ET la session prête.
  useEffect(() => {
    if (animDone && target) window.location.replace(target);
  }, [animDone, target]);

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

  return <CortexAwakening variant={variant} onDone={() => setAnimDone(true)} />;
}

/**
 * Enveloppe Suspense OBLIGATOIRE : `useSearchParams()` provoque un « CSR bailout » au prérendu
 * statique — sans cette frontière, `next build` échoue. Le fallback est un simple écran blanc (l'intro
 * démarre dès que les paramètres d'URL sont lus).
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-white" aria-hidden />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
