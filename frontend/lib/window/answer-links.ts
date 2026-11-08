/**
 * Les liens d'une réponse de Cortex (R120 : un volet s'ouvre depuis un lien dans une réponse). La clé d'une issue
 * (« OPS-35 ») et le nom d'un projet y deviennent des liens qui ouvrent leur volet, sans quitter la conversation. Une clé
 * n'est un lien que si son préfixe est celui d'un projet de l'espace : « UTF-8 » ou « ISO-8601 » restent du texte.
 */

/** Ce qu'un morceau de réponse ouvre : une issue (par son id quand la fenêtre le connaît, sinon par sa clé), un projet. */
export type AnswerLink =
  | { readonly kind: "issue"; readonly text: string; readonly projectId: number; readonly issueId: number | null; readonly key: string }
  | { readonly kind: "project"; readonly text: string; readonly projectId: number }

export type Segment = string | AnswerLink

/** Ce que la fenêtre connaît pour faire les liens : les projets de l'espace, et les issues qu'elle a sous la main. */
export interface LinkIndex {
  /** Les issues connues, par leur clé. */
  readonly issues: ReadonlyMap<string, { readonly projectId: number; readonly issueId: number }>
  /** Les projets, par le préfixe de leurs clés. */
  readonly prefixes: ReadonlyMap<string, number>
  /** Les projets, par leur nom. */
  readonly names: ReadonlyMap<string, number>
}

/** Une issue que la fenêtre connaît : celle d'un geste de la réponse, d'une mission, ou du tableau chargé. */
export interface KnownIssue {
  readonly projectId: number | null
  readonly issueId: number
  readonly key: string | null
}

/** Un nom de projet plus court n'est pas un lien : trop de mots ordinaires le seraient. */
const MIN_NAME = 3

export function linkIndex(
  projects: readonly { readonly id: number; readonly name: string; readonly identifier: string }[],
  known: readonly (KnownIssue | null | undefined)[],
): LinkIndex {
  const issues = new Map<string, { projectId: number; issueId: number }>()
  for (const issue of known) {
    if (issue?.key && issue.projectId !== null) issues.set(issue.key.toUpperCase(), { projectId: issue.projectId, issueId: issue.issueId })
  }
  const prefixes = new Map<string, number>()
  const names = new Map<string, number>()
  for (const project of projects) {
    if (project.identifier) prefixes.set(project.identifier.toUpperCase(), project.id)
    if (project.name.trim().length >= MIN_NAME) names.set(project.name.trim(), project.id)
  }
  return { issues, prefixes, names }
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const KEY = String.raw`[A-Z][A-Z0-9]{0,9}-\d+`

/** Le motif des liens d'un index : les clés d'issue, puis les noms de projet, les plus longs d'abord. */
function patternOf(index: LinkIndex): RegExp {
  const names = [...index.names.keys()].sort((a, b) => b.length - a.length).map(escape)
  const alternatives = [`(${KEY})`, ...(names.length > 0 ? [`(${names.join("|")})`] : [])]
  return new RegExp(String.raw`(?<![\p{L}\p{N}_-])(?:${alternatives.join("|")})(?![\p{L}\p{N}_])`, "gu")
}

/** Découpe un texte : le texte tel quel, et les liens vers ce qu'il nomme. */
export function splitLinks(text: string, index: LinkIndex): Segment[] {
  if (!text || (index.prefixes.size === 0 && index.names.size === 0)) return text ? [text] : []
  const segments: Segment[] = []
  let last = 0
  for (const match of text.matchAll(patternOf(index))) {
    const link = linkOf(match[1], match[2], index)
    if (!link) continue
    if (match.index > last) segments.push(text.slice(last, match.index))
    segments.push(link)
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push(text.slice(last))
  return segments
}

function linkOf(key: string | undefined, name: string | undefined, index: LinkIndex): AnswerLink | null {
  if (key) {
    const known = index.issues.get(key)
    if (known) return { kind: "issue", text: key, projectId: known.projectId, issueId: known.issueId, key }
    const projectId = index.prefixes.get(key.slice(0, key.lastIndexOf("-")))
    return projectId === undefined ? null : { kind: "issue", text: key, projectId, issueId: null, key }
  }
  const projectId = name ? index.names.get(name) : undefined
  return name && projectId !== undefined ? { kind: "project", text: name, projectId } : null
}
