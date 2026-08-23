"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { authService } from "@/lib/api/auth-service";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { AuthTransition } from "@/components/auth/auth-transition";

/**
 * Page de rappel de la connexion externe.
 *
 * Keycloak renvoie ici le navigateur avec `?code=…&state=…`. Cette page relaie le code à notre API,
 * qui seule détient le secret du client Keycloak et peut l'échanger contre des jetons. Rien n'est
 * décidé ici.
 *
 * <b>L'échange ne doit partir qu'une fois.</b> Un code d'autorisation est à usage unique : si React
 * remonte l'effet — ce que le mode strict fait délibérément en développement — le second appel
 * échouerait et afficherait une erreur sur une connexion pourtant réussie. D'où le garde par `ref`.
 *
 * <b>Transition premium.</b> L'échange peut aboutir en une fraction de seconde ; on impose un temps
 * minimum d'affichage puis une courte phase « succès » (coche) avant la redirection, pour que la
 * personne voie qu'elle est bien en train d'être connectée (cf. {@link AuthTransition}).
 */
const MIN_VISIBLE_MS = 1600;
const SUCCESS_HOLD_MS = 800;

function OAuthCallbackInner() {
  const params = useSearchParams();
  const { t } = usePreferencesStore();
  const [echecReseau, setEchecReseau] = useState<string | null>(null);
  const [phase, setPhase] = useState<"authenticating" | "success">("authenticating");
  const dejaEnvoye = useRef(false);
  const debut = useRef(0);

  const code = params.get("code");
  const state = params.get("state");

  // Refus du fournisseur (consentement annulé) ou réponse incomplète : entièrement DÉDUCTIBLES de l'URL.
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
      .then((auth) => {
        // Modèle Linear : tout le monde démarre en Free. Un NOUVEAU venu (onboarding non fait) va au
        // wizard ; un habitué va droit à l'app.
        const target = auth?.user?.onboardingCompleted === false ? "/onboarding" : "/";

        // Temps minimum d'affichage, puis coche, puis navigation DURE (le service a écrit jetons +
        // profil ; un rechargement complet reconstruit proprement les stores Zustand singletons —
        // même raison que la déconnexion).
        const reste = Math.max(0, MIN_VISIBLE_MS - (Date.now() - debut.current));
        window.setTimeout(() => {
          setPhase("success");
          window.setTimeout(() => window.location.replace(target), SUCCESS_HOLD_MS);
        }, reste);
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

  return (
    <AuthTransition
      phase={phase}
      title={phase === "success" ? "You're in" : "Signing you in"}
      subtitle={
        phase === "success" ? "Taking you to your workspace…" : "Securely connecting your account…"
      }
    />
  );
}

/**
 * Enveloppe Suspense OBLIGATOIRE : `useSearchParams()` provoque un « CSR bailout » au prérendu
 * statique — sans cette frontière, `next build` échoue. Le fallback réutilise l'écran de transition.
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <AuthTransition
          phase="authenticating"
          title="Signing you in"
          subtitle="Securely connecting your account…"
        />
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  );
}
