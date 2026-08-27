import type { Issue, IssuePriority } from "./api/issue-service"

/** État de filtrage partagé entre les vues d'un projet (board / list / backlog). */
export interface IssueFilterState {
  priorities: IssuePriority[]
  /** `null` = non assigné */
  assigneeIds: (number | null)[]
  labelIds: number[]
}

export const EMPTY_ISSUE_FILTERS: IssueFilterState = {
  priorities: [],
  assigneeIds: [],
  labelIds: [],
}

export function countActiveFilters(f: IssueFilterState): number {
  return f.priorities.length + f.assigneeIds.length + f.labelIds.length
}

/** Applique les filtres à une liste d'issues (combinaison ET entre catégories, OU à l'intérieur). */
export function applyIssueFilters(issues: Issue[], f: IssueFilterState): Issue[] {
  return issues.filter((issue) => {
    if (f.priorities.length > 0 && !f.priorities.includes(issue.priority)) return false
    if (f.assigneeIds.length > 0) {
      const aid = issue.assignee?.id ?? null
      if (!f.assigneeIds.includes(aid)) return false
    }
    if (f.labelIds.length > 0) {
      const ids = issue.labels.map((l) => l.id)
      if (!f.labelIds.some((id) => ids.includes(id))) return false
    }
    return true
  })
}

// --- Options dérivées des issues chargées (évite des fetchs supplémentaires) ---

export interface AssigneeOption { id: number | null; name: string; email?: string | null; avatarUrl?: string | null }
export interface LabelOption { id: number; name: string; color: string }

export function deriveAssigneeOptions(issues: Issue[]): AssigneeOption[] {
  const map = new Map<number, AssigneeOption>()
  let hasUnassigned = false
  for (const issue of issues) {
    const a = issue.assignee
    if (a) map.set(a.id, { id: a.id, name: a.displayName ?? a.email, email: a.email, avatarUrl: a.avatarUrl })
    else hasUnassigned = true
  }
  const out: AssigneeOption[] = [...map.values()]
  if (hasUnassigned) out.push({ id: null, name: "Unassigned" })
  return out
}

export function deriveLabelOptions(issues: Issue[]): LabelOption[] {
  const map = new Map<number, LabelOption>()
  for (const issue of issues) {
    for (const l of issue.labels) map.set(l.id, { id: l.id, name: l.name, color: l.color })
  }
  return [...map.values()]
}
