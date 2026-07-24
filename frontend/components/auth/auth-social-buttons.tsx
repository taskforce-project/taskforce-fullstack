"use client";

import { Github } from "lucide-react";

/**
 * Connexion via un fournisseur externe (GitHub, Google).
 *
 * <h3>Pourquoi ces boutons ne s'affichent pas encore</h3>
 * Ils sont pilotés par `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` (liste séparée par des virgules) et
 * restent absents tant que la variable n'est pas renseignée. Ce n'est pas une précaution
 * décorative : la connexion via un fournisseur externe **n'est pas implémentée côté serveur**, et
 * afficher un bouton qui mène à une erreur est pire que ne rien afficher.
 *
 * L'application authentifie aujourd'hui en **ROPC** (Keycloak reçoit l'adresse et le mot de passe,
 * renvoie les jetons). La connexion sociale exige le **flux d'autorisation** — une mécanique
 * entièrement différente :
 * <ol>
 *   <li>un fournisseur d'identité déclaré dans le realm Keycloak (aucun ne l'est aujourd'hui) ;</li>
 *   <li>une application OAuth chez GitHub dont l'URL de rappel pointe vers le courtier Keycloak ;</li>
 *   <li>une route de rappel dans cette application, qui échange le code contre des jetons ;</li>
 *   <li>la création du compte local au premier passage — l'utilisateur existe chez Keycloak mais pas
 *       encore dans notre table `users`.</li>
 * </ol>
 *
 * Le composant existe pour que la page soit **dessinée pour eux** : quand le flux sera là, seule la
 * variable d'environnement changera. La place, le séparateur et l'ordre sont déjà arbitrés.
 */

const PROVIDERS = {
  github: { label: "GitHub", icon: Github },
  google: { label: "Google", icon: null },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

function configuredProviders(): ProviderKey[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS ?? "";
  return raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is ProviderKey => p in PROVIDERS);
}

export function AuthSocialButtons() {
  const providers = configuredProviders();
  if (providers.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${providers.length}, 1fr)` }}>
        {providers.map((key) => {
          const { label, icon: Icon } = PROVIDERS[key];
          return (
            <a key={key} href={`/api/auth/oauth/${key}/authorize`} className="auth-social-btn">
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {label}
            </a>
          );
        })}
      </div>

      <div className="auth-separator">
        <span>ou</span>
      </div>
    </div>
  );
}
