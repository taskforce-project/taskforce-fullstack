/**
 * Le volet de la fenêtre (R119, R120, séance n°18) : la page de la route, ouverte à côté de la conversation. L'accueil
 * de l'espace (`/{slug}`) n'a pas de volet : seule la conversation s'y montre, centrée. Le volet ne se lit que dans la
 * route, et reste un emplacement générique : les lots suivants y ouvriront d'autres vues (l'issue, la vue du travail).
 */
export interface PaneRoute {
  /** Le premier segment après l'espace : dashboard, inbox, my-work, projects, analytics… */
  readonly section: string
  /** Le projet de la route (`/projects/12/…`), sinon null. */
  readonly projectId: number | null
}

const ID = /^\d+$/

export function paneOf(pathname: string | null | undefined): PaneRoute | null {
  const segments = (pathname ?? "").split("/").filter(Boolean)
  if (segments.length < 2) return null
  const section = segments[1]
  const projectId = section === "projects" && ID.test(segments[2] ?? "") ? Number(segments[2]) : null
  return { section, projectId }
}

/** L'accueil de l'espace : fermer le volet y mène. */
export const homePath = (slug: string): string => `/${slug}`

/** Le tableau d'un projet. */
export const boardPath = (slug: string, projectId: number): string => `/${slug}/projects/${projectId}`

/** Une issue, ouverte sur le tableau de son projet : sa fiche, et sa carte de résultat quand une mission a fini. */
export const issuePath = (slug: string, projectId: number, issueId: number): string =>
  `${boardPath(slug, projectId)}?issue=${issueId}`

/** Le titre du volet : le nom du projet de la route, sinon le nom de l'écran. */
export function paneTitle(
  pane: PaneRoute,
  projects: readonly { readonly id: number; readonly name: string }[],
  screens: Readonly<Record<string, string>>,
): string {
  if (pane.projectId !== null) return projects.find((p) => p.id === pane.projectId)?.name ?? screens.project ?? ""
  return screens[pane.section] ?? pane.section.charAt(0).toUpperCase() + pane.section.slice(1).replaceAll("-", " ")
}
