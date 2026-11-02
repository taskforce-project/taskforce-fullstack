/**
 * La version affichée de l'app : la version PRODUIT unique (« v1.7.0 », le même numéro que le site ; source
 * `frontend/product-version.json`, injectée par next.config) plutôt que le SHA opaque, qui reste lisible au survol.
 * Montrée au pied des pages de connexion et dans le menu du compte.
 */
export interface AppVersion {
  label: string;
  /** Le commit déployé, au survol ; absent hors déploiement. */
  title?: string;
}

export function appVersion(
  semver: string | undefined = process.env.NEXT_PUBLIC_APP_SEMVER,
  commit: string | undefined = process.env.NEXT_PUBLIC_APP_VERSION,
): AppVersion {
  return {
    label: semver ? `v${semver}` : (commit ?? "v1.0"),
    title: commit ? `commit ${commit}` : undefined,
  };
}
