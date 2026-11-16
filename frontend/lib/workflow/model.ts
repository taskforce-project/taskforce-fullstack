import type { ProjectRun } from "@/lib/api/delivery-service"
import type { Issue, IssueStatus, IssueStatusCategory, IssueSummary, ProjectIssueRelation } from "@/lib/api/issue-service"
import { parseServerDate } from "@/lib/utils/server-date"
import { isFinished, nodeStateOf, type NodeReason } from "@/lib/workflow/node-state"
import { STATE_RANK, type WorkflowState } from "@/lib/workflow/states"

/**
 * La carte du projet (séance n°25, W1) : les colonnes du projet comme étapes, dans l'ordre du tableau ; ses issues comme
 * nœuds, chacune avec sa dernière mission, ses demandes ouvertes, ses liens et son nombre de documents. Une logique pure,
 * linéaire en nombre d'issues, de missions et de liens : elle se recalcule à chaque donnée qui arrive, même pour 2 000
 * issues, sans rien perdre de ce que la personne regarde (aucune position n'est enregistrée, l'ordre se déduit des
 * données).
 */

/** La clé d'un nœud dans l'adresse (`?node=`) : une issue. */
export const issueKey = (issueId: number): string => `issue-${issueId}`

export interface WorkflowNode {
  readonly key: string
  readonly issue: Issue
  /** La dernière mission de l'issue, ses liens et ses demandes ouvertes ; null sans mission. */
  readonly run: ProjectRun | null
  readonly state: WorkflowState
  readonly reason: NodeReason
  /** Ses pièces jointes. */
  readonly documents: number
  /** Sa date est passée, et elle n'est pas finie. */
  readonly overdue: boolean
  /** Les issues qui la bloquent, finies ou non, et celles qu'elle bloque. */
  readonly blockedBy: readonly IssueSummary[]
  readonly blocks: readonly IssueSummary[]
  /** Sa colonne. */
  readonly stageId: number
  /** 1 : une sous-issue rangée sous son parent, dans la même colonne. */
  readonly depth: 0 | 1
  readonly parentKey: string | null
}

export interface StageModel {
  readonly status: IssueStatus
  /** Ses nœuds, triés : par état, puis dans l'ordre du tableau ; une sous-issue juste après son parent. */
  readonly nodes: readonly WorkflowNode[]
  /** Combien de nœuds dans chaque état. */
  readonly counts: Readonly<Partial<Record<WorkflowState, number>>>
}

export interface WorkflowCounts {
  readonly needsYou: number
  readonly blocked: number
  readonly missing: number
  readonly failed: number
}

export interface WorkflowModel {
  readonly stages: readonly StageModel[]
  readonly byKey: ReadonlyMap<string, WorkflowNode>
  /** La clé du nœud d'une mission et d'une demande (`run-{id}`, `approval-{id}` dans l'adresse). */
  readonly runKeys: ReadonlyMap<number, string>
  readonly approvalKeys: ReadonlyMap<number, string>
  readonly counts: WorkflowCounts
  /** Ce qui est fait (les issues terminées), sur le total (sans les issues annulées). */
  readonly done: number
  readonly total: number
}

export interface WorkflowInput {
  readonly statuses: readonly IssueStatus[]
  /** Toutes les issues du projet, sous-issues comprises, sans les archivées. */
  readonly issues: readonly Issue[]
  /** Les missions lues du projet, dans n'importe quel ordre. */
  readonly runs: readonly ProjectRun[]
  readonly relations: readonly ProjectIssueRelation[]
  /** Le nombre de documents de chaque issue qui en a. */
  readonly documents: Readonly<Record<number, number>>
  readonly me: string | number | null | undefined
  /** Aujourd'hui, `AAAA-MM-JJ` à l'heure de la personne : une date passée se compare à lui. */
  readonly today: string
  /** Maintenant (la minute de la vue) : une demande échue ne compte plus sur son nœud (R159, N6). */
  readonly now?: Date
}

const createdAt = (row: ProjectRun): number => (row.run.createdAt ? parseServerDate(row.run.createdAt).getTime() : 0)

/** La plus récente d'abord, comme la liste du serveur. */
const newerFirst = (a: ProjectRun, b: ProjectRun): number => createdAt(b) - createdAt(a) || b.run.id - a.run.id

/** L'ordre du tableau dans une colonne : épinglées d'abord, puis la position, puis la plus récente. */
function boardOrder(a: Issue, b: Issue): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  const pa = a.position ?? Number.MAX_SAFE_INTEGER
  const pb = b.position ?? Number.MAX_SAFE_INTEGER
  if (pa !== pb) return pa - pb
  return b.sequenceNumber - a.sequenceNumber
}

/** Une liste sans doublon d'issue, dans l'ordre d'arrivée. */
/**
 * Les issues pas finies qui bloquent une issue, quel que soit le sens où le lien a été posé : ce que lit une carte hors de
 * la vue (la conversation), avec les mêmes règles que la carte du projet.
 */
export function blockersOf(
  issueId: number,
  relations: readonly ProjectIssueRelation[],
  categoryOf: (summary: IssueSummary) => IssueStatusCategory | null | undefined,
): IssueSummary[] {
  const found: IssueSummary[] = []
  for (const relation of relations) {
    const other = relation.relationType === "BLOCKS" && relation.target.id === issueId ? relation.source
      : relation.relationType === "BLOCKED_BY" && relation.source.id === issueId ? relation.target : null
    if (other && !found.some((known) => known.id === other.id) && !isFinished(categoryOf(other))) found.push(other)
  }
  return found
}

function pushOnce(map: Map<number, IssueSummary[]>, issueId: number, other: IssueSummary): void {
  const list = map.get(issueId)
  if (!list) map.set(issueId, [other])
  else if (!list.some((known) => known.id === other.id)) list.push(other)
}

export function buildWorkflow(input: WorkflowInput): WorkflowModel {
  const { statuses, issues, runs, relations, documents, me, today, now = null } = input
  const byId = new Map<number, Issue>()
  for (const issue of issues) byId.set(issue.id, issue)

  // La dernière mission de chaque issue, et si elle relance une mission d'avant.
  const latest = new Map<number, ProjectRun>()
  const retried = new Set<number>()
  const seen = new Map<number, number>()
  for (const row of [...runs].sort(newerFirst)) {
    const issueId = row.run.issueId
    const count = seen.get(issueId) ?? 0
    if (count === 0) latest.set(issueId, row)
    else if (count === 1 && row.run.outcome === "RETRIED") retried.add(issueId)
    seen.set(issueId, count + 1)
  }

  // Les liens qui bloquent, quel que soit le sens où ils ont été posés.
  const blockedBy = new Map<number, IssueSummary[]>()
  const blocks = new Map<number, IssueSummary[]>()
  for (const relation of relations) {
    if (relation.relationType === "BLOCKS") {
      pushOnce(blockedBy, relation.target.id, relation.source)
      pushOnce(blocks, relation.source.id, relation.target)
    } else if (relation.relationType === "BLOCKED_BY") {
      pushOnce(blockedBy, relation.source.id, relation.target)
      pushOnce(blocks, relation.target.id, relation.source)
    }
  }
  // Le statut d'une issue liée : celui de la liste quand elle le connaît (le plus récent), sinon celui du lien.
  const categoryOf = (summary: IssueSummary) => byId.get(summary.id)?.status.category ?? summary.status?.category

  const stageIds = new Set(statuses.map((status) => status.id))
  const byKey = new Map<string, WorkflowNode>()
  const runKeys = new Map<number, string>()
  const approvalKeys = new Map<number, string>()
  const counts = { needsYou: 0, blocked: 0, missing: 0, failed: 0 }
  let done = 0
  let total = 0

  for (const issue of issues) {
    if (issue.archived) continue
    const run = latest.get(issue.id) ?? null
    const theirBlockers = blockedBy.get(issue.id) ?? []
    const unfinished = theirBlockers.filter((blocker) => !isFinished(categoryOf(blocker)))
    const { state, reason } = nodeStateOf({
      category: issue.status.category, run, retried: retried.has(issue.id), blockers: unfinished, me, now,
    })
    const key = issueKey(issue.id)
    const parent = issue.parent ? byId.get(issue.parent.id) : undefined
    const sameStage = parent !== undefined && parent.status.id === issue.status.id && !parent.archived
    const node: WorkflowNode = {
      key,
      issue,
      run,
      state,
      reason,
      documents: documents[issue.id] ?? 0,
      overdue: Boolean(issue.dueDate) && (issue.dueDate as string).slice(0, 10) < today && !isFinished(issue.status.category),
      blockedBy: theirBlockers,
      blocks: blocks.get(issue.id) ?? [],
      stageId: issue.status.id,
      depth: sameStage ? 1 : 0,
      parentKey: sameStage && parent ? issueKey(parent.id) : null,
    }
    byKey.set(key, node)
    if (run) {
      runKeys.set(run.run.id, key)
      for (const approval of run.approvals) approvalKeys.set(approval.id, key)
    }
    if (state === "needsYou") counts.needsYou++
    else if (state === "blocked") counts.blocked++
    else if (state === "missing") counts.missing++
    else if (state === "failed") counts.failed++
    if (issue.status.category !== "CANCELLED") total++
    if (issue.status.category === "COMPLETED") done++
  }

  // Chaque colonne : ses groupes (une issue, et ses sous-issues de la même colonne), triés par le meilleur état du groupe,
  // puis dans l'ordre du tableau.
  const groups = new Map<number, Map<string, WorkflowNode[]>>()
  for (const node of byKey.values()) {
    if (!stageIds.has(node.stageId)) continue
    const stage = groups.get(node.stageId) ?? new Map<string, WorkflowNode[]>()
    groups.set(node.stageId, stage)
    const head = node.parentKey ?? node.key
    const group = stage.get(head) ?? []
    stage.set(head, group)
    group.push(node)
  }

  const rankOf = (node: WorkflowNode): number => STATE_RANK[node.state]
  const byStateThenBoard = (a: WorkflowNode, b: WorkflowNode): number =>
    rankOf(a) - rankOf(b) || boardOrder(a.issue, b.issue)

  const stages: StageModel[] = [...statuses].sort((a, b) => a.position - b.position).map((status) => {
    const stageGroups = [...(groups.get(status.id)?.entries() ?? [])].map(([head, members]) => {
      const parent = members.find((member) => member.key === head)
      const children = members.filter((member) => member.key !== head).sort(byStateThenBoard)
      // Un parent absent de la liste (pas encore lu) : ses sous-issues se rangent seules, au premier niveau.
      const ordered = parent ? [parent, ...children] : children.map((child) => ({ ...child, depth: 0 as const, parentKey: null }))
      const best = Math.min(...ordered.map(rankOf))
      return { best, lead: ordered[0], ordered }
    })
    stageGroups.sort((a, b) => a.best - b.best || boardOrder(a.lead.issue, b.lead.issue))
    const nodes = stageGroups.flatMap((group) => group.ordered)
    const stageCounts: Partial<Record<WorkflowState, number>> = {}
    for (const node of nodes) stageCounts[node.state] = (stageCounts[node.state] ?? 0) + 1
    return { status, nodes, counts: stageCounts }
  })

  // Chaque mission d'une issue de la carte, pas seulement la dernière : `run-{id}` dans l'adresse mène à son issue, et
  // l'inspecteur montre cette mission-là.
  for (const row of runs) {
    const key = issueKey(row.run.issueId)
    if (!byKey.has(key)) continue
    if (!runKeys.has(row.run.id)) runKeys.set(row.run.id, key)
    for (const approval of row.approvals) if (!approvalKeys.has(approval.id)) approvalKeys.set(approval.id, key)
  }

  return { stages, byKey, runKeys, approvalKeys, counts, done, total }
}

/**
 * Le nœud d'une clé de l'adresse : `issue-{id}`, ou la mission (`run-{id}`) et la demande (`approval-{id}`) que porte le
 * nœud d'une issue ; null quand elle ne désigne rien de la carte.
 */
export function resolveNode(model: WorkflowModel, key: string | null | undefined): WorkflowNode | null {
  if (!key) return null
  const match = /^(issue|run|approval)-(\d+)$/.exec(key)
  if (!match) return null
  const id = Number(match[2])
  const nodeKey = match[1] === "issue" ? key : match[1] === "run" ? model.runKeys.get(id) : model.approvalKeys.get(id)
  return nodeKey ? (model.byKey.get(nodeKey) ?? null) : null
}

/** Le nœud de la colonne qui suit, dans l'ordre du tableau : « Next » dans l'inspecteur ; null pour la dernière. */
export function nextStage(model: WorkflowModel, stageId: number): IssueStatus | null {
  const index = model.stages.findIndex((stage) => stage.status.id === stageId)
  return index >= 0 && index < model.stages.length - 1 ? model.stages[index + 1].status : null
}

/** Aujourd'hui, `AAAA-MM-JJ` à l'heure de la personne. */
export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
