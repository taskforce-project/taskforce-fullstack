import type { IssueStatusCategory } from "@/lib/api/issue-service"
import type { StageModel, WorkflowModel, WorkflowNode } from "@/lib/workflow/model"
import { issueKey } from "@/lib/workflow/model"
import {
  ATTENTION, EXCEPTIONS, FILTER_STATE, STATE_RANK, TERMINAL, type Density, type WorkflowFilter, type WorkflowState,
} from "@/lib/workflow/states"

/**
 * Ce qu'une colonne montre (séance n°25, §3, §4.2, §10) : ses lignes, dans l'ordre, et ce qui reste replié. Au-delà de
 * cinq cartes faites, « Show {count} done » ; au-delà de cinquante cartes, « Show {count} more » ; une issue garde trois
 * de ses sous-issues sous elle, les autres derrière « Show {count} more sub-issues ». En Summary, seules les exceptions
 * gardent une carte (Needs you, Failed, Missing, Blocked, et ce qui a passé sa date), le reste n'est qu'un compte. Le nœud
 * choisi n'est jamais replié : ce qui le cache s'ouvre. Une logique pure : la colonne ne rend que les lignes visibles.
 */

export const DONE_SHOWN = 5
export const MORE_AFTER = 50
export const CHILDREN_SHOWN = 3

export type ColumnRow =
  | { readonly type: "node"; readonly key: string; readonly node: WorkflowNode }
  | { readonly type: "children"; readonly key: string; readonly parentKey: string; readonly hidden: number }
  | { readonly type: "more"; readonly key: string; readonly hidden: number }
  | { readonly type: "done"; readonly key: string; readonly hidden: number }

export interface ColumnOptions {
  readonly density: Density
  readonly filter: WorkflowFilter | null
  /** La personne a ouvert ce qui était replié dans cette colonne. */
  readonly showDone: boolean
  readonly showAll: boolean
  /** Les parents dont toutes les sous-issues se montrent. */
  readonly openParents: ReadonlySet<string>
  readonly selectedKey: string | null
}

/** Une exception de Summary : elle garde sa carte d'une ligne. */
export const isException = (node: WorkflowNode): boolean => EXCEPTIONS.has(node.state) || node.overdue

/** Les nœuds d'une colonne que le filtre et la densité gardent, dans l'ordre de la colonne. */
function kept(stage: StageModel, options: ColumnOptions): WorkflowNode[] {
  const { filter, density } = options
  if (filter) return stage.nodes.filter((node) => node.state === FILTER_STATE[filter])
  if (density === "summary") return stage.nodes.filter(isException)
  return [...stage.nodes]
}

export function columnRows(stage: StageModel, options: ColumnOptions): ColumnRow[] {
  const nodes = kept(stage, options)
  const flat = options.filter !== null || options.density === "summary"
  const selected = options.selectedKey
  const selectedNode = selected ? nodes.find((node) => node.key === selected) : undefined

  // Les sous-issues au-delà de trois, sous un parent fermé ; celui du nœud choisi s'ouvre.
  const hiddenChildren = new Map<string, WorkflowNode[]>()
  const visible: WorkflowNode[] = []
  const shownUnder = new Map<string, number>()
  for (const node of nodes) {
    const parent = flat ? null : node.parentKey
    if (parent && nodes.some((other) => other.key === parent)) {
      const open = options.openParents.has(parent) || selectedNode?.parentKey === parent
      const count = shownUnder.get(parent) ?? 0
      if (!open && count >= CHILDREN_SHOWN) {
        hiddenChildren.set(parent, [...(hiddenChildren.get(parent) ?? []), node])
        continue
      }
      shownUnder.set(parent, count + 1)
    }
    visible.push(flat && node.depth === 1 ? { ...node, depth: 0, parentKey: null } : node)
  }

  // Un parent et ses sous-issues ne se séparent pas : dès que l'un d'eux est actif (une sous-issue repliée comprise), tout
  // le groupe reste dans la partie active de la colonne, et la sous-issue ne part pas loin de son parent.
  const groupOf = (node: WorkflowNode) => (!flat && node.depth === 1 && node.parentKey ? node.parentKey : node.key)
  const activeGroups = new Set<string>()
  for (const node of nodes) if (!TERMINAL.has(node.state)) activeGroups.add(groupOf(node))
  const isActive = (node: WorkflowNode) => activeGroups.has(groupOf(node))
  const active = visible.filter(isActive)
  const finished = visible.filter((node) => !isActive(node))
  const selectedAt = (list: readonly WorkflowNode[]) => (selected ? list.findIndex((node) => node.key === selected) : -1)
  const showAll = options.showAll || selectedAt(active) >= MORE_AFTER
  const showDone = options.showDone || selectedAt(finished) >= DONE_SHOWN

  const rows: ColumnRow[] = []
  const pushNodes = (list: readonly WorkflowNode[]) => {
    for (const node of list) {
      rows.push({ type: "node", key: node.key, node })
      // La ligne des sous-issues repliées suit la dernière montrée de son parent.
      const parent = node.depth === 1 ? node.parentKey : null
      const hidden = parent ? hiddenChildren.get(parent) : undefined
      if (parent && hidden && isLastShownChild(list, node)) {
        rows.push({ type: "children", key: `children-${parent}`, parentKey: parent, hidden: hidden.length })
      }
    }
  }
  const activeShown = showAll ? active : active.slice(0, MORE_AFTER)
  pushNodes(activeShown)
  if (activeShown.length < active.length) rows.push({ type: "more", key: "more", hidden: active.length - activeShown.length })
  const finishedShown = showDone ? finished : finished.slice(0, DONE_SHOWN)
  pushNodes(finishedShown)
  if (finishedShown.length < finished.length) rows.push({ type: "done", key: "done", hidden: finished.length - finishedShown.length })
  return rows
}

/** Le dernier enfant montré de son parent dans la liste : la ligne de ceux qui restent repliés vient après lui. */
function isLastShownChild(list: readonly WorkflowNode[], node: WorkflowNode): boolean {
  const index = list.indexOf(node)
  const next = list[index + 1]
  return !next || next.parentKey !== node.parentKey
}

/** Les nœuds visibles, colonne après colonne : l'ordre de `j` et `k`. */
export function visibleOrder(columns: readonly (readonly ColumnRow[])[]): string[] {
  return columns.flatMap((rows) => rows.filter((row) => row.type === "node").map((row) => row.key))
}

/** Le nœud suivant (`j`, ↓) ou précédent (`k`, ↑), colonne par colonne ; le premier quand rien n'est choisi. */
export function stepNode(order: readonly string[], current: string | null, step: 1 | -1): string | null {
  if (order.length === 0) return null
  const index = current ? order.indexOf(current) : -1
  if (index < 0) return step === 1 ? order[0] : order[order.length - 1]
  return order[Math.min(order.length - 1, Math.max(0, index + step))]
}

/** La colonne voisine (← et →) : le nœud à la même hauteur, sinon le dernier de la colonne ; null sans voisine. */
export function neighborNode(columns: readonly (readonly ColumnRow[])[], current: string | null, step: 1 | -1): string | null {
  const nodesOf = (rows: readonly ColumnRow[]) => rows.filter((row) => row.type === "node").map((row) => row.key)
  const lists = columns.map(nodesOf)
  const at = current ? lists.findIndex((keys) => keys.includes(current)) : -1
  const row = at >= 0 && current ? lists[at].indexOf(current) : 0
  for (let column = (at < 0 ? (step === 1 ? -1 : lists.length) : at) + step; column >= 0 && column < lists.length; column += step) {
    const keys = lists[column]
    if (keys.length > 0) return keys[Math.min(row, keys.length - 1)]
  }
  return null
}

/**
 * Le prochain nœud qui demande l'attention (`f`) : Needs you, puis Failed, puis Missing, chacun dans l'ordre des colonnes ;
 * après le nœud choisi, et en boucle. Il cherche dans toute la carte, même dans ce qui est replié.
 */
export function nextAttention(model: WorkflowModel, current: string | null): string | null {
  const order: WorkflowNode[] = []
  for (const state of ATTENTION) {
    for (const stage of model.stages) {
      for (const node of stage.nodes) if (node.state === state) order.push(node)
    }
  }
  if (order.length === 0) return null
  const index = current ? order.findIndex((node) => node.key === current) : -1
  return order[(index + 1) % order.length].key
}

/** Une arête des dépendances du nœud choisi : de ce qui bloque vers ce qui est bloqué. */
export interface DependencyEdge {
  readonly from: string
  readonly to: string
  /** Vu du nœud choisi : ce qui le bloque (en amont), ou ce qu'il bloque (en aval). */
  readonly side: "blockedBy" | "blocks"
}

export const MAX_EDGES = 50

/**
 * Les dépendances du nœud choisi seulement (§4.8) : en amont ce qui le bloque, en aval ce qu'il bloque, cinquante arêtes
 * au plus ; au-delà, combien restent (« and {count} more »). Jamais toutes les arêtes de la carte.
 */
/** « Show all links » : 200 arêtes au plus, les plus proches de ce qui se voit d'abord (décision du CEO, 16/11/2026). */
export const MAX_ALL_EDGES = 200

/**
 * Toutes les dépendances de la carte, une arête par lien, de ce qui bloque vers ce qui est bloqué : ce que « Show all links »
 * dessine entre les cartes à l'écran (le calque ne garde que celles dont les deux cartes se voient).
 */
export function allDependencies(model: WorkflowModel): DependencyEdge[] {
  const seen = new Set<string>()
  const edges: DependencyEdge[] = []
  for (const node of model.byKey.values()) {
    for (const other of node.blocks) {
      const to = issueKey(other.id)
      const key = `${node.key}>${to}`
      if (seen.has(key) || !model.byKey.has(to)) continue
      seen.add(key)
      edges.push({ from: node.key, to, side: "blocks" })
    }
  }
  return edges
}

export function dependenciesOf(node: WorkflowNode | null): { edges: DependencyEdge[]; more: number } {
  if (!node) return { edges: [], more: 0 }
  const all: DependencyEdge[] = [
    ...node.blockedBy.map((other): DependencyEdge => ({ from: issueKey(other.id), to: node.key, side: "blockedBy" })),
    ...node.blocks.map((other): DependencyEdge => ({ from: node.key, to: issueKey(other.id), side: "blocks" })),
  ]
  return { edges: all.slice(0, MAX_EDGES), more: Math.max(0, all.length - MAX_EDGES) }
}

/** Les nœuds liés au nœud choisi : ils restent nets quand les autres s'estompent. */
export function relatedKeys(node: WorkflowNode | null): ReadonlySet<string> {
  if (!node) return new Set()
  return new Set([node.key, ...node.blockedBy.map((o) => issueKey(o.id)), ...node.blocks.map((o) => issueKey(o.id))])
}

/**
 * L'état que le nom d'une colonne dit déjà : Done pour une colonne finie, Skipped pour une colonne annulée, Not started pour
 * une colonne de travail pas commencé. Son compte ne le redit pas : « Cancelled 1 · 1 skipped » disait deux mots pour une
 * seule chose (R161, L5).
 */
const SAID_BY_COLUMN: Readonly<Partial<Record<IssueStatusCategory, WorkflowState>>> = {
  BACKLOG: "notStarted", UNSTARTED: "notStarted", COMPLETED: "done", CANCELLED: "skipped",
}

/**
 * Le compte d'une colonne en Summary, des exceptions au reste : « 1 needs you · 3 working ». Ce que le nom de la colonne
 * dit déjà ne s'y redit pas ; une colonne où rien d'autre ne se passe n'a pas de compte (une chaîne vide).
 */
export function stageCountLine(stage: StageModel, words: Readonly<Record<string, string>>, fill: (text: string, values: Record<string, number>) => string): string {
  const said = SAID_BY_COLUMN[stage.status.category]
  return Object.entries(stage.counts)
    .filter(([state, count]) => state !== said && (count ?? 0) > 0)
    .sort(([a], [b]) => STATE_RANK[a as keyof typeof STATE_RANK] - STATE_RANK[b as keyof typeof STATE_RANK])
    .map(([state, count]) => fill(words[state] ?? "", { count: count ?? 0 }))
    .join(" · ")
}
