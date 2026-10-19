"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authService, type AuthResponse } from "@/lib/api/auth-service";
import { acceptInvitation } from "@/lib/api/invitation-service";
import { takeInvitationToken } from "@/lib/utils/pending-invitation";
import { globalRateLimiter } from "@/lib/utils/validation";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { LoginIntro } from "@/components/layout/login-intro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { afterSignInPath } from "@/lib/auth/desktop-handoff";

/**
 * Page de rappel de la connexion externe (GitHub / Google).
 *
 * Keycloak renvoie ici le navigateur avec `?code=…&state=…`. Cette page relaie le code à notre API,
 * qui seule détient le secret du client et peut l'échanger contre des jetons. Rien n'est décidé ici.
 *
 * <b>L'échange ne part qu'une fois</b> (garde par `ref` - le mode strict remonte l'effet en dev, et un
 * code d'autorisation est à usage unique).
 *
 * <b>2FA.</b> Quand la personne a activé le 2FA, le serveur ne rend pas de session mais un défi scellé
 * (OSS-1.1 : la connexion externe contournait le 2FA). La page demande alors le code, comme le formulaire
 * de connexion, et échange défi + code contre la session.
 *
 * <b>Intro « ElevenLabs ».</b> Pendant l'échange on montre la 1ʳᵉ moitié de l'intro (le logo TaskForce
 * qui s'illumine, {@link LoginIntro} `phase="hold"`). Au succès on pose le drapeau `tf.intro` et on
 * navigue en dur (les stores Zustand se reconstruisent proprement) ; l'`AppShell` joue alors la 2ᵉ
 * moitié (vague + révélation) <b>en overlay pendant que l'app charge</b> - pas de loader, pas de
 * coupure. La frame de jointure (logo illuminé sur le fond de l'app) étant identique, le rechargement
 * est invisible.
 */
const MIN_HOLD_MS = 650;

/** Entrée dans l'app, commune au rappel direct et au rappel suivi du code 2FA. */
async function enterApp(auth: AuthResponse, startedAt: number) {
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

  // Modèle Linear : un NOUVEAU venu (onboarding non fait) va au wizard ; un habitué à l'app. Une connexion demandée
  // par l'app desktop revient sur son accord.
  const target = afterSignInPath(auth?.user?.onboardingCompleted === false ? "/onboarding" : "/");

  // Drapeau consommé une fois par l'AppShell → joue la révélation en overlay. sessionStorage
  // survit au rechargement dans le même onglet.
  try {
    sessionStorage.setItem("tf.intro", "1");
  } catch {
    /* mode privé / stockage indisponible - on navigue quand même, sans révélation */
  }

  // Petit temps de présence du logo avant le rechargement, pour masquer la jointure.
  const reste = Math.max(0, MIN_HOLD_MS - (Date.now() - startedAt));
  window.setTimeout(() => window.location.replace(target), reste);
}

function OAuthCallbackInner() {
  const params = useSearchParams();
  const { t } = usePreferencesStore();
  const [echecReseau, setEchecReseau] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [totp, setTotp] = useState("");
  const [verifying, setVerifying] = useState(false);
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
      .then((auth) => {
        if (auth.twoFactorRequired && auth.twoFactorChallenge) {
          setChallenge(auth.twoFactorChallenge);
          return;
        }
        return enterApp(auth, debut.current);
      })
      .catch((e: unknown) => {
        setEchecReseau(e instanceof Error ? e.message : t.auth.ui.callbackConnectFailed);
      });
  }, [code, state, refusFournisseur, t]);

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    if (totp.length !== 6) {
      toast.error(t.common.error, { description: t.auth.ui.twoFactorEnterCode });
      return;
    }
    // Même limite que le formulaire de connexion (anti-brute-force ; le backend a la sienne).
    if (!globalRateLimiter.isAllowed("login-2fa", 6, 2 * 60 * 1000)) {
      toast.error(t.common.error, { description: t.auth.ui.twoFactorTooManyCodes });
      return;
    }
    setVerifying(true);
    try {
      const auth = await authService.oauthTwoFactor({ challenge, totp });
      globalRateLimiter.reset("login-2fa");
      await enterApp(auth, Date.now() - MIN_HOLD_MS);
    } catch (error) {
      setTotp("");
      setVerifying(false);
      toast.error(t.common.error, {
        description: error instanceof Error ? error.message : t.auth.ui.callbackConnectFailed,
      });
    }
  };

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

  if (challenge) {
    return (
      <div className="auth-panel">
        <h1 className="auth-title">{t.auth.ui.twoFactorTitle}</h1>
        <p className="auth-subtitle">{t.auth.ui.twoFactorSubtitle}</p>
        <form onSubmit={verifyCode} className="mt-6 space-y-4">
          <Input
            id="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            required
            autoFocus
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
            disabled={verifying}
            className="auth-input text-center font-mono tracking-[0.4em]"
          />
          <Button type="submit" disabled={verifying || totp.length !== 6} className="auth-submit">
            {verifying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.auth.ui.signingIn}
              </>
            ) : (
              t.auth.ui.twoFactorVerify
            )}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs">
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
