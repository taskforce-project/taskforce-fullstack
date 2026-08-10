"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import { authService } from "@/lib/api/auth-service";

/**
 * Page de rappel de la connexion externe.
 *
 * Keycloak renvoie ici le navigateur avec `?code=…&state=…`. Cette page ne fait qu'une chose : relayer
 * le code à notre API, qui seule détient le secret du client Keycloak et peut l'échanger contre des
 * jetons. Rien n'est décidé ici.
 *
 * <b>L'échange ne doit partir qu'une fois.</b> Un code d'autorisation est à usage unique : si React
 * remonte l'effet — ce que le mode strict fait délibérément en développement — le second appel
 * échouerait et afficherait une erreur sur une connexion pourtant réussie. D'où le garde par `ref`,
 * qui survit au remontage là où un état serait réinitialisé.
 */
export default function OAuthCallbackPage() {
  const params = useSearchParams();
  const [echecReseau, setEchecReseau] = useState<string | null>(null);
  const dejaEnvoye = useRef(false);

  const code = params.get("code");
  const state = params.get("state");

  // Refus du fournisseur (consentement annulé, application révoquée) ou réponse incomplète : deux
  // situations entièrement DÉDUCTIBLES de l'URL. Les recopier dans un état serait stocker ce qu'on
  // sait déjà — et provoquerait un rendu en cascade que le linter signale à juste titre.
  const refusFournisseur =
    params.get("error_description") ??
    params.get("error") ??
    (!code || !state ? "Réponse incomplète du fournisseur d'identité." : null);

  const erreur = refusFournisseur ?? echecReseau;

  useEffect(() => {
    // `!code || !state` est logiquement redondant — `refusFournisseur` le couvre déjà — mais il est
    // nécessaire au typage : TypeScript ne peut pas déduire d'une valeur dérivée que ces deux
    // variables sont non nulles. Le rendre explicite vaut mieux qu'une assertion non nulle, qui
    // masquerait un vrai changement de logique.
    if (dejaEnvoye.current || refusFournisseur || !code || !state) return;
    dejaEnvoye.current = true;

    // La même URL de rappel qu'à l'autorisation : Keycloak la compare, elle doit correspondre à
    // l'octet près. On la reconstruit depuis l'origine courante plutôt que de la stocker.
    const redirectUri = `${window.location.origin}/auth/callback`;

    authService
      .oauthCallback({ code, state, redirectUri })
      .then((auth) => {
        // Navigation DURE, et non `router.replace`. Le service vient d'écrire les jetons et le profil
        // dans le stockage local ; le contexte d'authentification et les stores Zustand sont des
        // singletons de module, déjà initialisés sur « personne n'est connecté ». Un rechargement
        // complet est la façon la plus simple de les reconstruire sur la session fraîche — c'est la
        // symétrie exacte de ce que fait déjà la déconnexion, et pour la même raison.
        //
        // Modèle Linear : tout le monde démarre en Free, il n'y a plus d'écran de choix de plan à
        // l'inscription. Un NOUVEAU venu (onboarding non fait) va au wizard d'onboarding ; un habitué
        // va droit à l'app. Le passage payant se fait plus tard, in-app (Réglages → Facturation).
        const target = auth?.user?.onboardingCompleted === false ? "/onboarding" : "/";
        window.location.replace(target);
      })
      .catch((e: unknown) => {
        setEchecReseau(e instanceof Error ? e.message : "Connexion impossible.");
      });
  }, [code, state, refusFournisseur]);

  if (erreur) {
    return (
      <div className="auth-panel text-center">
        <AlertCircle className="mx-auto h-8 w-8" style={{ color: "var(--accent-red)" }} />
        <h1 className="auth-title mt-3">Connexion impossible</h1>
        <p className="auth-subtitle">{erreur}</p>
        <p className="mt-5 text-xs">
          <Link href="/auth/login" className="auth-link">
            Revenir à la connexion
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-panel text-center">
      <Loader2 className="mx-auto h-7 w-7 animate-spin" style={{ color: "var(--label-tertiary)" }} />
      <h1 className="auth-title mt-3">Connexion en cours</h1>
      <p className="auth-subtitle">Un instant, nous finalisons votre session.</p>
    </div>
  );
}
