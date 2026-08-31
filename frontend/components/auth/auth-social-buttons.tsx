"use client";

import { Github } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/api/auth-service";
import { usePreferencesStore } from "@/lib/store/preferences-store";

/**
 * Connexion via un fournisseur externe (GitHub, Google).
 *
 * <h3>Deux listes, et la distinction est le cœur du composant</h3>
 * - `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` : ce qui est **affiché**.
 * - `NEXT_PUBLIC_AUTH_SOCIAL_READY` : ce qui est **réellement câblé** côté serveur.
 *
 * Un bouton affiché mais non câblé ne mène pas à une erreur : il annonce clairement que le chemin
 * n'est pas encore ouvert. C'est le seul moyen honnête de montrer une intention de produit sans
 * mentir sur l'état du système - et cela devient fonctionnel en déplaçant un nom d'une liste à
 * l'autre, sans toucher au composant.
 *
 * <h3>Ce qu'il reste à faire pour câbler un fournisseur</h3>
 * L'application authentifie en **ROPC** (mot de passe → Keycloak → jetons). La connexion sociale
 * exige le **flux d'autorisation**, soit quatre pièces :
 * <ol>
 *   <li>une application OAuth **dédiée** chez le fournisseur, dont l'URL de rappel pointe vers le
 *       courtier Keycloak ({@code /realms/<realm>/broker/<provider>/endpoint}). Celle qui sert
 *       l'intégration GitHub ne convient pas : une OAuth App n'accepte qu'une seule URL de rappel,
 *       et celle-ci vise déjà {@code /api/integrations/github/callback} ;</li>
 *   <li>le fournisseur d'identité déclaré dans le realm Keycloak ;</li>
 *   <li>une route de rappel dans cette application, qui échange le code contre des jetons ;</li>
 *   <li>la création du compte local au premier passage - l'utilisateur existe alors chez Keycloak
 *       mais pas encore dans notre table {@code users}.</li>
 * </ol>
 */

/** Le « G » officiel de Google en 4 couleurs - c'est la forme imposée par les consignes de marque
 *  « Sign in with Google » (le monochrome n'est autorisé que sur fond de couleur pleine). */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        fill="#EA4335"
      />
    </svg>
  );
}

const PROVIDERS = {
  github: { label: "GitHub", Icon: Github },
  google: { label: "Google", Icon: GoogleMark },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

function parseList(raw: string | undefined): ProviderKey[] {
  return (raw ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is ProviderKey => p in PROVIDERS);
}

export function AuthSocialButtons() {
  const { t } = usePreferencesStore();
  // Par défaut on affiche les deux : c'est une décision de produit assumée, la page annonce les
  // chemins prévus. Aucun n'est câblé par défaut, donc aucun ne prétend fonctionner.
  const shown = parseList(process.env.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS ?? "github,google");
  const ready = parseList(process.env.NEXT_PUBLIC_AUTH_SOCIAL_READY);

  if (shown.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
        {shown.map((key) => {
          const { label, Icon } = PROVIDERS[key];
          const isReady = ready.includes(key);

          if (isReady) {
            // Un bouton et non un lien : l'URL de départ n'est pas connue d'avance, elle est demandée
            // au serveur parce qu'elle porte l'état anti-CSRF signé.
            return (
              <button
                key={key}
                type="button"
                className="auth-social-btn"
                onClick={() => {
                  void authService
                    .oauthAuthorizeUrl(key, `${window.location.origin}/auth/callback`)
                    .then((url) => {
                      window.location.href = url;
                    })
                    .catch((e: unknown) => {
                      toast.error(t.auth.ui.socialUnavailableTitle.replace("{provider}", label), {
                        description: e instanceof Error ? e.message : undefined,
                      });
                    });
                }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          }

          return (
            <button
              key={key}
              type="button"
              className="auth-social-btn"
              aria-describedby={`${key}-indispo`}
              onClick={() =>
                toast.info(t.auth.ui.socialComingSoonTitle.replace("{provider}", label), {
                  description: t.auth.ui.socialComingSoonDescription,
                })
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              <span id={`${key}-indispo`} className="sr-only">
                {t.auth.ui.socialComingSoonBadge}
              </span>
            </button>
          );
        })}
      </div>

      <div className="auth-separator">
        <span>{t.common.or}</span>
      </div>
    </div>
  );
}
