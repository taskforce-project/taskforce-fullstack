/**
 * Origines externes - SOURCE UNIQUE, dérivées d'un seul domaine.
 *
 * « Préfixe (sous-domaine) dans le code, suffixe (domaine) en variable d'env. » En production on ne
 * fixe qu'un domaine de base - `NEXT_PUBLIC_BASE_DOMAIN` (ex. « taskforce-project.fr ») - et on en
 * DÉRIVE les origines : `api.<base>`, `files.<base>`, `<base>` (site vitrine). Changer de domaine =
 * **une seule variable**. En développement, repli sur localhost (ports historiques). Une variable
 * `NEXT_PUBLIC_*` explicite l'emporte toujours (échappatoire / rétro-compatibilité / dev multi-hôte).
 *
 * ⚠️ Les `NEXT_PUBLIC_*` sont INLINÉES au BUILD par Next (elles finissent dans le bundle client) :
 * ces constantes sont donc figées au build, comme les valeurs qu'elles remplacent. Les poser à
 * l'exécution n'a aucun effet côté navigateur - elles doivent être passées en `build.args` (cf.
 * `frontend/Dockerfile`). Consommé par : `lib/api/client.ts`, `app/auth/layout.tsx`, `next.config.ts`
 * (qui ré-inline la même dérivation, ne pouvant pas importer ce module au chargement de la config).
 */

/** Retire les slashs de fin d'une URL/domaine brut (chaîne vide si absent). */
const trimTrailingSlash = (value: string | undefined): string => (value ?? "").replace(/\/+$/, "");

/** Domaine de base nu, sans protocole ni slash final (ex. « taskforce-project.fr »). */
const BASE_DOMAIN = trimTrailingSlash(process.env.NEXT_PUBLIC_BASE_DOMAIN).replace(/^https?:\/\//, "");

/** `https://<prefix><base>` si un domaine de base est défini, sinon chaîne vide (→ on tombe sur le repli). */
const fromBase = (subdomainPrefix: string): string =>
  BASE_DOMAIN ? `https://${subdomainPrefix}${BASE_DOMAIN}` : "";

/** API telle que le NAVIGATEUR la joint (CSR). */
export const API_URL =
  trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL) || fromBase("api.") || "http://localhost:8080";

/**
 * API telle que le SERVEUR Next la joint (SSR). En mono-hôte (dev) c'est le nom de service Docker ;
 * en déploiement multi-VM le frontend et le backend sont sur des hôtes distincts, donc le SSR passe
 * lui aussi par l'URL publique - d'où la dérivation sur `api.<base>` avant le repli `backend:8080`.
 */
export const API_URL_SSR =
  trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL_SSR) || fromBase("api.") || "http://backend:8080";

/** Stockage objet (MinIO/S3) tel que le navigateur le joint (URL présignées). */
export const STORAGE_URL =
  trimTrailingSlash(process.env.NEXT_PUBLIC_STORAGE_URL) || fromBase("files.") || "http://localhost:9000";

/** Site vitrine (Astro/Vercel) - cible du lien « retour au site ». Apex du domaine de base. */
export const SITE_URL =
  trimTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL) || fromBase("") || "http://localhost:4321";
