import { boardPath, paneOf } from "@/lib/window/pane"

/**
 * Les adresses de la fenêtre (R120, séance n°18 : chaque état de la fenêtre a son adresse, et le bouton retour marche).
 * Le chemin dit le volet ; la requête dit ce qui s'y ajoute : `issue`, l'issue ouverte par-dessus l'écran du volet (avec
 * `project` quand le chemin ne nomme pas son projet), et `c`, la conversation. L'issue garde l'adresse du tableau
 * (`/{slug}/projects/{id}?issue={issueId}`), celle que les liens partagés, les notifications et « Copy link » donnaient
 * déjà : le tableau reste monté sous l'issue, et le retour le retrouve tel qu'il était.
 */

/** Ce que la fenêtre lit de la requête : `useSearchParams()`, `URLSearchParams` ou `location.search`. */
export interface SearchLike {
  get(name: string): string | null
  toString(): string
}

/** La clé d'une issue (« OPS-35 ») : le préfixe de son projet, un tiret, son numéro. */
export const ISSUE_KEY = /^[A-Z][A-Z0-9]{0,9}-\d+$/

/** L'issue que l'adresse ouvre par-dessus le volet : par son id, ou par sa clé quand un lien ne connaît qu'elle. */
export interface IssueTarget {
  readonly projectId: number
  readonly issueId: number | null
  readonly key: string | null
}

/** Une issue à ouvrir : son projet, et son id ou sa clé. */
export interface IssueRef {
  readonly projectId: number
  readonly issueId?: number | null
  readonly key?: string | null
}

const ID = /^\d+$/

const idOf = (value: string | null | undefined): number | null => (value && ID.test(value) ? Number(value) : null)

/** Les écrans d'un projet où son issue s'ouvre par-dessus : le tableau, la liste, le backlog. */
const PROJECT_HOSTS = new Set(["", "list", "backlog"])
/** Les écrans de l'espace qui listent des issues de plusieurs projets : l'issue s'y ouvre par-dessus, son projet en requête. */
const WORKSPACE_HOSTS = new Set(["inbox", "my-work"])

function paramsOf(search: SearchLike | string | null | undefined): URLSearchParams {
  if (!search) return new URLSearchParams()
  return new URLSearchParams(typeof search === "string" ? search : search.toString())
}

/** Le chemin et sa requête, changée : une valeur nulle retire le paramètre. */
export function hrefWith(
  pathname: string,
  search: SearchLike | string | null | undefined,
  changes: Readonly<Record<string, string | null>>,
): string {
  const params = paramsOf(search)
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) params.delete(name)
    else params.set(name, value)
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** Un autre écran, avec la conversation de la fenêtre : rien d'autre de l'écran d'avant ne le suit. */
export function withConversation(pathname: string, search: SearchLike | string | null | undefined): string {
  return hrefWith(pathname, null, { c: paramsOf(search).get("c") })
}

/** L'issue que l'adresse ouvre par-dessus le volet, ou null. */
export function issueOf(pathname: string | null | undefined, search: SearchLike | null | undefined): IssueTarget | null {
  const raw = search?.get("issue")?.trim()
  const route = paneOf(pathname)
  if (!raw || !route) return null
  const projectId = route.projectId ?? idOf(search?.get("project"))
  if (projectId === null) return null
  const issueId = idOf(raw)
  if (issueId !== null) return { projectId, issueId, key: null }
  const key = raw.toUpperCase()
  return ISSUE_KEY.test(key) ? { projectId, issueId: null, key } : null
}

/** Le segment d'un écran de projet après son id (« list », « backlog »), « » pour le tableau ; null hors d'un projet. */
function projectScreen(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean)
  if (segments[1] !== "projects" || !ID.test(segments[2] ?? "") || segments.length > 4) return null
  return segments[3] ?? ""
}

/**
 * Où s'ouvre une issue : par-dessus l'écran du volet quand il liste les issues de son projet (le tableau, la liste, le
 * backlog) ou celles de l'espace (Waiting for you, My work) ; ailleurs (une réponse de Cortex, la zone de droite, le
 * tableau de bord), par-dessus le tableau de son projet. La conversation suit.
 */
export function issueHref(pathname: string, search: SearchLike | string | null | undefined, slug: string, issue: IssueRef): string {
  const value = issue.issueId != null ? String(issue.issueId) : (issue.key ?? "")
  const route = paneOf(pathname)
  const screen = projectScreen(pathname)
  if (route?.projectId === issue.projectId && screen !== null && PROJECT_HOSTS.has(screen)) {
    return hrefWith(pathname, search, { issue: value, project: null })
  }
  if (route && route.projectId === null && WORKSPACE_HOSTS.has(route.section) && issue.issueId != null) {
    return hrefWith(pathname, search, { issue: value, project: String(issue.projectId) })
  }
  return hrefWith(boardPath(slug, issue.projectId), null, { c: paramsOf(search).get("c"), issue: value })
}

/** L'écran sous l'issue : la même adresse, sans elle. */
export function closeIssueHref(pathname: string, search: SearchLike | string | null | undefined): string {
  return hrefWith(pathname, search, { issue: null, project: null })
}

/** Ce que l'issue recouvre, pour son fil d'Ariane : `board`, `list` ou `backlog` d'un projet, sinon la section du volet. */
export function screenUnder(pathname: string | null | undefined): string {
  const screen = projectScreen(pathname ?? "")
  if (screen === "") return "board"
  return screen ?? paneOf(pathname)?.section ?? ""
}

/** La vue du travail d'une mission (R95, point 3). */
export const missionPath = (slug: string, runId: number): string => `/${slug}/missions/${runId}`

/** La mission d'une vue du travail (`/{slug}/missions/{runId}`), sinon null. */
export function missionOf(pathname: string | null | undefined): number | null {
  const segments = (pathname ?? "").split("/").filter(Boolean)
  return segments[1] === "missions" && segments.length === 3 ? idOf(segments[2]) : null
}

/** La conversation de l'adresse (`?c=`), sinon null. */
export function conversationOf(search: SearchLike | null | undefined): number | null {
  return idOf(search?.get("c"))
}

/** Deux adresses de la même page : le même chemin, les mêmes paramètres, dans n'importe quel ordre. */
export function sameAddress(a: string, b: string): boolean {
  const split = (href: string) => {
    const at = href.indexOf("?")
    const path = at < 0 ? href : href.slice(0, at)
    const params = [...new URLSearchParams(at < 0 ? "" : href.slice(at + 1)).entries()]
      .map(([name, value]) => `${name}=${value}`)
      .sort()
    return `${path}?${params.join("&")}`
  }
  return split(a) === split(b)
}

/** Ce que le navigateur dit de son historique (Navigation API), quand il le dit. */
interface NavigationLike {
  readonly currentEntry: { readonly index: number } | null
  entries(): readonly { readonly url: string | null }[]
}

/** L'adresse de l'entrée d'avant dans l'historique, sur ce site ; null quand le navigateur ne la dit pas. */
export function previousAddress(): string | null {
  const navigation = (globalThis as { navigation?: NavigationLike }).navigation
  const index = navigation?.currentEntry?.index
  if (!navigation || typeof index !== "number" || index < 1) return null
  const url = navigation.entries()[index - 1]?.url
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.origin === globalThis.location?.origin ? `${parsed.pathname}${parsed.search}` : null
  } catch {
    return null
  }
}

/** Une issue désignée par une adresse d'issue (`/{slug}/projects/{id}/issues/{issueId}`, ou le tableau et `?issue=`). */
export function issueRefOfUrl(url: string | null | undefined): IssueRef | null {
  if (!url) return null
  const route = /\/projects\/(\d+)\/issues\/(\d+)\/?(?:[?#].*)?$/.exec(url)
  if (route) return { projectId: Number(route[1]), issueId: Number(route[2]) }
  const board = /\/projects\/(\d+)\/?\?(?:.*&)?issue=(\d+)(?:&.*)?$/.exec(url)
  return board ? { projectId: Number(board[1]), issueId: Number(board[2]) } : null
}
