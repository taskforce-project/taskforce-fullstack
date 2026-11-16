// Des données de test du workflow : des issues, des colonnes et des missions telles que l'API les rend. Jamais chargées
// par l'application (le dossier `__tests__` est hors du code livré).
import type { DeliveryRun, DeliveryRunApproval, ProjectRun, ProjectRunStepKey } from "@/lib/api/delivery-service"
import type { Issue, IssueStatus, IssueStatusCategory, ProjectIssueRelation } from "@/lib/api/issue-service"

export const ME = "7"

export function status(id: number, name: string, category: IssueStatusCategory, position = id): IssueStatus {
  return { id, name, category, color: "#736e67", position, isDefault: false } as IssueStatus
}

export const TODO = status(1, "Todo", "UNSTARTED", 1)
export const DOING = status(2, "In Progress", "STARTED", 2)
export const DONE = status(3, "Done", "COMPLETED", 3)
export const CANCELLED = status(4, "Cancelled", "CANCELLED", 4)
export const STATUSES = [TODO, DOING, DONE, CANCELLED]

export function issue(id: number, patch: Partial<Issue> = {}): Issue {
  return {
    id,
    sequenceNumber: id,
    identifier: `WEB-${id}`,
    projectId: 3,
    projectName: "Website",
    title: `Issue ${id}`,
    description: null,
    priority: "NONE",
    status: TODO,
    type: null,
    assignee: null,
    reporter: { id: 7, email: "pierre@acme.dev", displayName: "Pierre Martin", avatarUrl: null },
    assignmentStatus: null,
    parent: null,
    childCount: 0,
    startDate: null,
    dueDate: null,
    completedAt: null,
    position: id,
    storyPoints: null,
    labels: [],
    commentCount: 0,
    archived: false,
    pinned: false,
    createdAt: "2026-11-01T09:00:00",
    updatedAt: "2026-11-01T09:00:00",
    ...patch,
  } as Issue
}

export function deliveryRun(id: number, issueId: number, patch: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id,
    issueId,
    issueKey: `WEB-${issueId}`,
    issueTitle: `Issue ${issueId}`,
    projectId: 3,
    projectName: "Website",
    providerKey: "claude-code",
    model: null,
    status: "RUNNING",
    summary: null,
    resultUrl: null,
    error: null,
    startedById: 7,
    startedByName: "Pierre Martin",
    createdAt: `2026-11-1${Math.min(id, 9)}T10:00:00`,
    updatedAt: null,
    outcome: null,
    ...patch,
  }
}

export function approval(id: number, patch: Partial<DeliveryRunApproval> = {}): DeliveryRunApproval {
  return {
    id,
    tool: "Bash",
    summary: "npm run build",
    status: "PENDING",
    createdAt: "2026-11-13T10:00:00",
    // Loin devant : la vue lit l'heure réelle, et une demande échue ne compte plus sur son nœud (R159, N6).
    expiresAt: "2099-11-13T10:30:00",
    decidedAt: null,
    decidedBy: null,
    canDecide: true,
    askedBy: "agent",
    action: "shell",
    rule: null,
    reason: null,
    ...patch,
  }
}

export function projectRun(run: DeliveryRun, approvals: DeliveryRunApproval[] = [], key: ProjectRunStepKey = "do"): ProjectRun {
  return {
    run,
    step: { key, seq: 3, kind: "tool", tool: "Edit", at: "2026-11-13T10:00:00" },
    links: { branch: run.branch ?? null, pullRequestUrl: null, followUpOf: run.followUpOf ?? null, followedUpBy: null },
    approvals,
  }
}

export function relation(id: number, source: Issue, target: Issue, relationType: ProjectIssueRelation["relationType"] = "BLOCKS"): ProjectIssueRelation {
  const summary = (i: Issue) => ({ id: i.id, sequenceNumber: i.sequenceNumber, identifier: i.identifier, title: i.title, status: i.status })
  return {
    id,
    relationType,
    source: summary(source),
    target: summary(target),
    createdBy: { id: 7, email: "pierre@acme.dev", displayName: "Pierre Martin", avatarUrl: null },
    createdAt: "2026-11-13T10:00:00",
  } as ProjectIssueRelation
}

/** Un grand projet : `count` issues réparties dans les colonnes, `runs` missions et `links` liens « blocks ». */
export function bigProject(count: number, runs: number, links: number): { issues: Issue[]; runs: ProjectRun[]; relations: ProjectIssueRelation[] } {
  const columns = [TODO, DOING, DONE, CANCELLED]
  const issues = Array.from({ length: count }, (_, i) => issue(i + 1, {
    status: columns[i % 7 === 0 ? 3 : i % 3],
    assignee: i % 2 === 0 ? { id: 7, email: "pierre@acme.dev", displayName: "Pierre Martin", avatarUrl: null } : null,
    dueDate: i % 11 === 0 ? "2026-11-01" : null,
    parent: i > 10 && i % 13 === 0 ? { id: i - 1, sequenceNumber: i - 1, identifier: `WEB-${i - 1}`, title: `Issue ${i - 1}`, status: columns[(i - 1) % 3] } : null,
  }))
  const missions = Array.from({ length: runs }, (_, i) => {
    const issueId = (i * 7) % count + 1
    const kind = i % 5
    const run = deliveryRun(i + 1, issueId, {
      status: kind === 0 ? "RUNNING" : kind === 1 ? "QUEUED" : kind === 2 ? "FAILED" : "DONE",
      error: kind === 2 ? "The tests failed" : null,
      outcome: kind === 3 ? "APPLIED" : null,
      createdAt: `2026-11-${String(1 + (i % 12)).padStart(2, "0")}T${String(8 + (i % 10)).padStart(2, "0")}:00:00`,
    })
    return projectRun(run, kind === 0 && i % 2 === 0 ? [approval(i + 1, { canDecide: i % 4 === 0 })] : [])
  })
  const relations = Array.from({ length: links }, (_, i) => relation(i + 1, issues[i % count], issues[(i * 3 + 1) % count]))
  return { issues, runs: missions, relations }
}
