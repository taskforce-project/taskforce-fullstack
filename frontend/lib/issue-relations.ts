import type { IssueRelation, IssueRelationType } from "@/lib/api/issue-service"

/**
 * Le mot d'un lien entre deux issues, sur la fiche (PROD-2.2) : tel qu'il a été posé depuis l'issue lue, ou retourné quand
 * l'issue lue en est la cible (« A blocks B » se lit depuis B « Blocked by A »). Le serveur le dit (`fromTarget`) ; un
 * serveur plus ancien ne le dit pas, et le lien se lit alors comme posé.
 */
export const RELATION_LABELS: Readonly<Record<IssueRelationType, string>> = {
  BLOCKS: "Blocks",
  BLOCKED_BY: "Blocked by",
  DUPLICATE: "Duplicate of",
  RELATES_TO: "Relates to",
}

export const RELATION_FROM_TARGET: Readonly<Record<IssueRelationType, string>> = {
  BLOCKS: "Blocked by",
  BLOCKED_BY: "Blocks",
  DUPLICATE: "Duplicated by",
  RELATES_TO: "Relates to",
}

export function relationLabel(relation: Pick<IssueRelation, "relationType" | "fromTarget">): string {
  return (relation.fromTarget ? RELATION_FROM_TARGET : RELATION_LABELS)[relation.relationType]
}
