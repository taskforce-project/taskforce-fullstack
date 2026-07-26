"use client";

import { Github } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/api/auth-service";

/**
 * Connexion via un fournisseur externe (GitHub, Google).
 *
 * <h3>Deux listes, et la distinction est le cœur du composant</h3>
 * - `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` : ce qui est **affiché**.
 * - `NEXT_PUBLIC_AUTH_SOCIAL_READY` : ce qui est **réellement câblé** côté serveur.
 *
 * Un bouton affiché mais non câblé ne mène pas à une erreur : il annonce clairement que le chemin
 * n'est pas encore ouvert. C'est le seul moyen honnête de montrer une intention de produit sans
 * mentir sur l'état du système — et cela devient fonctionnel en déplaçant un nom d'une liste à
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
 *   <li>la création du compte local au premier passage — l'utilisateur existe alors chez Keycloak
 *       mais pas encore dans notre table {@code users}.</li>
 * </ol>
 */

/** Le « G » de Google en monochrome : la version multicolore est une marque déposée. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.35 11.1H12v2.9h5.35c-.25 1.35-1.02 2.5-2.17 3.27v2.27h2.92c1.71-1.57 2.7-3.9 2.7-6.66 0-.64-.06-1.25-.15-1.78Z"
        fill="currentColor"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-2.92-2.27c-.81.55-1.86.88-3.05.88-2.6 0-4.8-1.76-5.58-4.12H4.06v2.35A9.99 9.99 0 0 0 12 22Z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M6.42 14.06a5.99 5.99 0 0 1 0-3.83V7.88H4.06a9.99 9.99 0 0 0 0 8.53l2.36-2.35Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M12 5.98c1.47 0 2.78.5 3.82 1.49l2.58-2.58C16.95 3.4 14.7 2.4 12 2.4a9.99 9.99 0 0 0-7.94 5.48l2.36 2.35C7.2 7.87 9.4 5.98 12 5.98Z"
        fill="currentColor"
        opacity="0.9"
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
                      toast.error(`Connexion ${label} indisponible`, {
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
                toast.info(`Connexion ${label} bientôt disponible`, {
                  description: "En attendant, utilisez votre adresse et votre mot de passe.",
                })
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              <span id={`${key}-indispo`} className="sr-only">
                bientôt disponible
              </span>
            </button>
          );
        })}
      </div>

      <div className="auth-separator">
        <span>ou</span>
      </div>
    </div>
  );
}
