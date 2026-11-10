import type { IssueCommentHit, IssueHit } from "@/lib/api/issue-service"

/**
 * Ce que Ctrl+K trouve de lui-même (R141, séance n°20) : les projets, les personnes, les conversations, les écrans et les
 * gestes se cherchent ici, sans le serveur. Les mots tapés comptent tous, dans n'importe quel ordre, sans la casse ni les
 * accents.
 */

const plain = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Les mots de ce qu'on tape. */
const wordsOf = (query: string): string[] => plain(query).split(/\s+/).filter(Boolean)

/** Le texte contient-il chaque mot tapé ? */
export function matches(text: string, query: string): boolean {
  const haystack = plain(text)
  return wordsOf(query).every((word) => haystack.includes(word))
}

/** Les éléments dont le texte répond, les `max` premiers ; tous sans texte tapé. */
export function pick<T>(items: readonly T[], query: string, text: (item: T) => string, max: number): T[] {
  return (query ? items.filter((item) => matches(text(item), query)) : items).slice(0, max)
}

/** Les issues trouvées par un commentaire, sans celles déjà trouvées par leur titre : une issue, une ligne. */
export function commentsApart(comments: readonly IssueCommentHit[], issues: readonly IssueHit[]): IssueCommentHit[] {
  const found = new Set(issues.map((issue) => issue.id))
  return comments.filter((comment) => !found.has(comment.issueId))
}
