import { sameAddress, type SearchLike } from "@/lib/window/address"
import { homePath, paneOf } from "@/lib/window/pane"

/**
 * Là où la personne a laissé la fenêtre (R123, séance n°18) : au démarrage, la dernière conversation et son volet, pour
 * cette personne et cet espace. L'adresse dit tout (le volet, `?issue=`, `?c=`) : retenir l'endroit, c'est retenir
 * l'adresse ; le rouvrir, c'est y aller. « New conversation » en ouvre toujours une neuve : son adresse n'a pas de `c`,
 * et c'est elle qui se retient.
 */

/** Les écrans qui ne se rouvrent pas au démarrage : les réglages s'ouvrent en fenêtre, à part. */
const NOT_A_PLACE = new Set(["settings"])

const queryOf = (search: SearchLike | string | null | undefined): string => {
  if (!search) return ""
  const text = typeof search === "string" ? search : search.toString()
  return text.startsWith("?") ? text.slice(1) : text
}

/** L'adresse de la fenêtre : le chemin et sa requête. */
export function addressOf(pathname: string, search: SearchLike | string | null | undefined): string {
  const query = queryOf(search)
  return query ? `${pathname}?${query}` : pathname
}

/** L'accueil nu de l'espace : ni volet, ni rien dans la requête. C'est là que le démarrage rouvre l'endroit retenu. */
export function isBareHome(pathname: string | null | undefined, search: SearchLike | string | null | undefined, slug: string): boolean {
  return Boolean(slug) && pathname === homePath(slug) && queryOf(search) === ""
}

/** L'adresse à retenir pour cet espace : dans l'espace, hors des réglages ; null sinon. */
export function placeOf(pathname: string | null | undefined, search: SearchLike | string | null | undefined, slug: string): string | null {
  if (!slug || !pathname) return null
  if (pathname !== homePath(slug) && !pathname.startsWith(`${homePath(slug)}/`)) return null
  const pane = paneOf(pathname)
  if (pane && NOT_A_PLACE.has(pane.section)) return null
  return addressOf(pathname, search)
}

/** L'endroit à rouvrir : celui retenu, quand la fenêtre s'ouvre sur l'accueil nu de l'espace et qu'il en diffère. */
export function placeToRestore(
  pathname: string | null | undefined,
  search: SearchLike | string | null | undefined,
  slug: string,
  remembered: string | null | undefined,
): string | null {
  if (!remembered || !isBareHome(pathname, search, slug)) return null
  const home = homePath(slug)
  // Une adresse d'un autre espace ne se rouvre pas ici, même quand son nom commence pareil (« /ops » et « /opsx »).
  if (!remembered.startsWith(`${home}/`) && !remembered.startsWith(`${home}?`)) return null
  return sameAddress(remembered, home) ? null : remembered
}
