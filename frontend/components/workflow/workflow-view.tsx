"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
import { DependencyLayer } from "@/components/workflow/dependency-layer"
import { Inspector, type InspectorMode, type InspectorTab } from "@/components/workflow/inspector"
import { useNodeGestures } from "@/components/workflow/node-gestures"
import { WorkflowTitleControls } from "@/components/workflow/workflow-title-controls"
import { ObjectiveHeader } from "@/components/workflow/objective-header"
import { StageColumn } from "@/components/workflow/stage-column"
import { LegendDialog } from "@/components/workflow/workflow-controls"
import type { NodeAgent, NodeHandlers, NodeView } from "@/components/workflow/workflow-node"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useElementWidth } from "@/hooks/use-element-width"
import { useMinWidth } from "@/hooks/use-min-width"
import type { DeliveryProvider } from "@/lib/api/delivery-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useWorkflowData, type WorkflowLoad } from "@/lib/hooks/use-workflow-data"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useScreenStore } from "@/lib/store/screen-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { INSPECTOR_DEFAULT, useWorkflowViewStore } from "@/lib/store/workflow-view-store"
import { replaceQuery } from "@/lib/window/address"
import { buildWorkflow, issueKey, resolveNode, todayKey, type WorkflowModel, type WorkflowNode } from "@/lib/workflow/model"
import { canWriteProject } from "@/lib/workflow/rights"
import {
  governanceOf, nodeAction, nodeSentence, whoActs, type NodeAction, type SentenceTexts, type WorkflowTexts,
} from "@/lib/workflow/sentence"
import { COLUMN_WIDTH, isDensity, isFilter, type Density, type WorkflowFilter } from "@/lib/workflow/states"
import {
  columnRows, dependenciesOf, neighborNode, nextAttention, relatedKeys, stepNode, visibleOrder, type ColumnRow,
} from "@/lib/workflow/view"

/** Sous cette largeur de volet, l'inspecteur passe en feuille par-dessus les colonnes (§3). */
export const SHEET_BELOW = 900
/**
 * Sous cette largeur de la vue (le volet, et non la fenêtre : la conversation ouverte en prend une part), les colonnes
 * deviennent une liste de sections (§10).
 */
export const NARROW_BELOW = 768

const NO_DOCUMENTS: Readonly<Record<number, number>> = {}
const NO_PROVIDERS: readonly DeliveryProvider[] = []

/** L'agent de TaskForce travaille sur un modèle : sa carte dit lequel (« · qwen3:8b »), comme pour Cortex. */
const MODEL_SHOWN = new Set(["taskforce-agent"])

/** Une touche tapée dans un champ, ou avec un modificateur, n'est pas un geste de la vue. */
function typing(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target as HTMLElement | null
  if (!target) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

/** Une fenêtre au premier plan (un dialogue, un menu) garde ses touches. */
const layerOpen = () => document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']") !== null

/**
 * Le workflow d'un projet (séance n°25, W1) : la vue du projet au rang du tableau, pilotée sur ses nœuds, sur les données
 * vivantes seulement. L'en-tête de l'objectif, puis les colonnes du projet comme étapes, les issues comme nœuds, les
 * dépendances du nœud choisi sur un calque, et l'inspecteur. Le nœud choisi, la densité et le filtre sont dans l'adresse ;
 * la densité choisie en dernier se retient pour la personne. Pensée pour les grands projets : 2 000 issues, 300 missions,
 * des milliers de liens se lisent page par page, se calculent en une passe, et seules les cartes visibles se rendent.
 */
export function WorkflowView({ slug, projectId }: Readonly<{ slug: string; projectId: number }>) {
  const { load, live, retry } = useWorkflowData(slug, projectId)
  const setLive = useWorkflowViewStore((s) => s.setLive)

  useEffect(() => {
    setLive({ projectId, state: live.state, readAt: live.readAt })
  }, [projectId, live.state, live.readAt, setLive])
  useEffect(() => () => setLive(null), [setLive])

  return <WorkflowBoard slug={slug} projectId={projectId} load={load} retry={retry} />
}

function WorkflowBoard({ slug, projectId, load, retry }: Readonly<{
  slug: string
  projectId: number
  load: WorkflowLoad
  retry: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.workflow)
  const sequence = usePreferencesStore((s) => s.t.missionSequence)
  const rules = usePreferencesStore((s) => s.t.rules)
  const me = useUserStore((s) => s.user?.id ?? null)
  const person = me !== null ? String(me) : "anonymous"
  const search = useSearchParams()
  const nodeParam = search.get("node")
  const viewParam = search.get("view")
  const filterParam = search.get("filter")
  const issueOpen = search.get("issue") !== null
  const { openIssue, openMission } = usePaneNavigation()

  const statuses = useIssueStore((s) => s.statuses)
  const issues = useIssueStore((s) => (s.workflowIssues?.projectId === projectId ? s.workflowIssues.issues : null))
  const relations = useIssueStore((s) => s.projectRelations[projectId]?.relations ?? null)
  const documents = useIssueStore((s) => (s.documentCounts?.projectId === projectId ? s.documentCounts.counts : NO_DOCUMENTS))
  const runs = useDeliveryStore((s) => s.projectRuns[projectId]?.rows)
  const providers = useDeliveryStore((s) => s.projectProviders[projectId] ?? NO_PROVIDERS)
  const objective = useProjectStore((s) => s.objectives[projectId])
  const objectiveFailed = useProjectStore((s) => s.objectiveReadFailed[projectId] === true)
  const fetchObjective = useProjectStore((s) => s.fetchObjective)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const projectStart = project?.createdAt ?? null
  const workspaceMembers = useWorkspaceStore((s) => s.members)
  const canWrite = canWriteProject(project, me, workspaceMembers)
  const densities = useWorkflowViewStore((s) => s.densities)
  const setDensity = useWorkflowViewStore((s) => s.setDensity)
  const inspectorWidth = useWorkflowViewStore((s) => s.inspectorWidths[person] ?? INSPECTOR_DEFAULT)
  const setInspectorWidth = useWorkflowViewStore((s) => s.setInspectorWidth)
  const setLegendOpen = useWorkflowViewStore((s) => s.setLegendOpen)
  const showIssue = useScreenStore((s) => s.showIssue)
  const hideIssue = useScreenStore((s) => s.hideIssue)
  const gestures = useNodeGestures(slug, projectId)

  const rootRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const paneWidth = useElementWidth(rootRef)
  const wideWindow = useMinWidth(NARROW_BELOW)
  // La largeur de la vue décide, dès qu'elle est mesurée ; avant (le premier rendu, un test sans mise en page), la fenêtre.
  const narrow = paneWidth > 0 ? paneWidth < NARROW_BELOW : !wideWindow
  // Une vue étroite prend le direct, la densité et le filtre dans son en-tête : la ligne des onglets garde « Workflow ».
  const compact = paneWidth > 0 && paneWidth < SHEET_BELOW
  const setControlsInView = useWorkflowViewStore((s) => s.setControlsInView)
  useEffect(() => {
    setControlsInView(compact)
    return () => setControlsInView(false)
  }, [compact, setControlsInView])

  // La minute en cours : les phrases (« Done today at 14:05 ») ne se recalculent qu'à la minute.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000))
  useEffect(() => {
    const id = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 30_000)
    return () => clearInterval(id)
  }, [])
  const now = useMemo(() => new Date(minute * 60_000), [minute])

  const chosen: Density = isDensity(viewParam) ? viewParam : (densities[person] ?? "plan")
  // Sur un écran étroit, Plan seulement ; Summary se lit par le filtre « Needs you » (§10).
  const density: Density = narrow ? "plan" : chosen
  const filter: WorkflowFilter | null = isFilter(filterParam) ? filterParam : null

  const model: WorkflowModel | null = useMemo(() => {
    if (!issues) return null
    return buildWorkflow({
      statuses, issues, runs: runs ?? [], relations: relations ?? [], documents, me, today: todayKey(now),
    })
  }, [statuses, issues, runs, relations, documents, me, now])

  const selected = model ? resolveNode(model, nodeParam) : null
  // Une mission nommée dans l'adresse (`run-{id}`) : l'inspecteur montre celle-là, même si l'issue en a une plus récente.
  const focusRun = useMemo(() => {
    const id = /^run-(\d+)$/.exec(nodeParam ?? "")?.[1]
    return id && runs ? (runs.find((row) => row.run.id === Number(id)) ?? null) : null
  }, [nodeParam, runs])
  const selectedKey = selected?.key ?? null

  // Ce que chaque carte montre, calculé une fois par nœud et gardé tant que le nœud ne change pas.
  const texts: SentenceTexts = useMemo(() => ({ workflow: t, sequence, rules }), [t, sequence, rules])
  const agentOf = useCallback((key: string): DeliveryProvider | undefined => providers.find((p) => p.key === key), [providers])
  const views = useMemo(() => {
    const out = new Map<string, NodeView>()
    if (!model) return out
    const assigneeOf = (issueId: number) => model.byKey.get(issueKey(issueId))?.issue.assignee ?? null
    for (const node of model.byKey.values()) {
      out.set(node.key, nodeViewOf(node, texts, me, now, agentOf, assigneeOf))
    }
    return out
  }, [model, texts, me, now, agentOf])

  // Ce qui est déplié, colonne par colonne, et les parents ouverts.
  const [expanded, setExpanded] = useState<Readonly<Record<number, { done?: boolean; all?: boolean }>>>({})
  const [openParents, setOpenParents] = useState<ReadonlySet<string>>(() => new Set())
  const columns = useMemo(() => (model?.stages ?? []).map((stage) => columnRows(stage, {
    density, filter, showDone: expanded[stage.status.id]?.done === true, showAll: expanded[stage.status.id]?.all === true,
    openParents, selectedKey,
  })), [model, density, filter, expanded, openParents, selectedKey])
  const order = useMemo(() => visibleOrder(columns), [columns])

  // L'inspecteur s'ouvre au choix d'un nœud (au clic, au clavier, par un lien) ; Échap le ferme, puis la sélection.
  const [closedFor, setClosedFor] = useState<string | null>(null)
  const inspectorOpen = selectedKey !== null && closedFor !== selectedKey
  const setInspectorOpen = useCallback((open: boolean) => setClosedFor(open ? null : selectedKey), [selectedKey])
  const [tab, setTab] = useState<InspectorTab>("details")
  const [menuOpen, setMenuOpen] = useState(false)
  const [revealKey, setRevealKey] = useState<string | null>(null)
  // Le nœud choisi au clavier prend le focus dès que sa carte est rendue (elle peut l'être une image plus tard).
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    const key = focusNext.current
    if (!key) return
    const card = document.querySelector<HTMLElement>(`[data-node-focus="${key}"]`)
    if (card) {
      focusNext.current = null
      card.focus({ preventScroll: true })
    }
  })

  const select = useCallback((key: string | null, reveal = false) => {
    replaceQuery({ node: key })
    setClosedFor(null)
    setMenuOpen(false)
    setRevealKey(reveal ? key : null)
    focusNext.current = reveal ? key : null
  }, [])

  const open = useCallback((node: WorkflowNode) => {
    openIssue({ projectId, issueId: node.issue.id })
  }, [openIssue, projectId])

  const handlers: NodeHandlers = useMemo(() => ({
    onSelect: (key) => select(key),
    onOpen: (key) => {
      const node = model?.byKey.get(key)
      if (node) open(node)
    },
    onAction: (key: string, action: NodeAction) => {
      const node = model?.byKey.get(key)
      if (!node) return
      if (action === "review") {
        open(node)
        return
      }
      select(key)
      setTab("details")
    },
  }), [model, open, select])

  // Cortex voit le nœud choisi (R114) : l'issue de la sélection, tant qu'aucune fiche n'est ouverte par-dessus.
  const selectedIssueId = selected?.issue.id ?? null
  useEffect(() => {
    if (selectedIssueId === null || issueOpen) return
    showIssue(projectId, selectedIssueId)
    return () => hideIssue(selectedIssueId)
  }, [projectId, selectedIssueId, issueOpen, showIssue, hideIssue])

  // Un nœud qui passe à « Needs you » s'annonce poliment, et rien d'autre (§10).
  const [announce, setAnnounce] = useState("")
  const needing = useRef<ReadonlySet<string> | null>(null)
  useEffect(() => {
    if (!model) return
    const current = new Set([...model.byKey.values()].filter((node) => node.state === "needsYou").map((node) => node.key))
    const before = needing.current
    needing.current = current
    if (!before) return
    const arrived = [...current].find((key) => !before.has(key))
    const node = arrived ? model.byKey.get(arrived) : undefined
    if (node) setAnnounce(fillText(t.announce, { title: node.issue.title }))
  }, [model, t.announce])

  const chooseDensity = useCallback((next: Density) => {
    setDensity(person, next)
    replaceQuery({ view: next === "plan" ? null : next })
  }, [person, setDensity])
  const chooseFilter = useCallback((next: WorkflowFilter | null) => replaceQuery({ filter: next }), [])

  // Le clavier (§6.3) : j k, les flèches, f, Entrée, d, ., m, 1 2 3, ?, Échap. Rien quand on écrit, ni sous une fiche.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!model || issueOpen || typing(event) || layerOpen()) return
      const key = event.key
      // Les flèches et Entrée ne déplacent la sélection que depuis une carte (ou rien) : l'inspecteur garde les siennes.
      const active = document.activeElement as HTMLElement | null
      const onCard = !active || active === document.body || active.dataset.nodeFocus !== undefined
      const go = (next: string | null) => {
        if (!next) return
        event.preventDefault()
        select(next, true)
      }
      switch (key) {
        case "j": return go(stepNode(order, selectedKey, 1))
        case "k": return go(stepNode(order, selectedKey, -1))
        case "ArrowDown": return onCard ? go(stepNode(order, selectedKey, 1)) : undefined
        case "ArrowUp": return onCard ? go(stepNode(order, selectedKey, -1)) : undefined
        case "ArrowRight": return onCard ? go(neighborNode(columns, selectedKey, 1)) : undefined
        case "ArrowLeft": return onCard ? go(neighborNode(columns, selectedKey, -1)) : undefined
        case "f": return go(nextAttention(model, selectedKey))
        case "1": case "2": case "3":
          if (narrow) return
          event.preventDefault()
          return chooseDensity(key === "1" ? "summary" : key === "2" ? "plan" : "detail")
        case "?":
          event.preventDefault()
          return setLegendOpen(true)
        case "Escape":
          if (inspectorOpen && selected) {
            event.preventDefault()
            setInspectorOpen(false)
          } else if (selected) {
            event.preventDefault()
            select(null)
          }
          return
      }
      if (!selected) return
      if (key === "Enter" && onCard && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        open(selected)
      } else if (key === "d" && selected.reason.kind === "approval") {
        event.preventDefault()
        setInspectorOpen(true)
        setTab("details")
      } else if (key === ".") {
        event.preventDefault()
        gestures.ask(selected)
      } else if (key === "m") {
        event.preventDefault()
        setInspectorOpen(true)
        setMenuOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [model, issueOpen, order, columns, selected, selectedKey, inspectorOpen, setInspectorOpen, narrow, select, open, gestures,
    chooseDensity, setLegendOpen])

  const dependencies = useMemo(() => dependenciesOf(selected), [selected])
  const related = useMemo(() => (selected ? relatedKeys(selected) : null), [selected])

  // La même racine pendant la lecture et après : sa largeur se mesure dès le premier rendu (sans elle, la mesure partait
  // sur le squelette, sans élément, et ne revenait jamais : l'inspecteur ne devenait jamais une feuille).
  if (load === "loading" || !model) {
    return (
      <div ref={rootRef} className="relative flex h-full min-h-0 flex-col border border-border">
        {load === "error" ? <LoadFailed t={t} retry={retry} /> : <BoardSkeleton density={density} />}
      </div>
    )
  }

  const empty = model.byKey.size === 0
  const filteredEmpty = !empty && order.length === 0 && filter !== null
  const inspectorMode: InspectorMode = narrow ? "full" : paneWidth > 0 && paneWidth < SHEET_BELOW ? "sheet" : "side"
  const showInspector = selected !== null && inspectorOpen
  const agent = selected ? agentView(selected, agentOf) : null

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col border border-border">
      <ObjectiveHeader
        slug={slug}
        projectId={projectId}
        objective={objective}
        readFailed={objectiveFailed}
        onRetry={() => void fetchObjective(slug, projectId)}
        projectStart={projectStart}
        counts={model.counts}
        done={model.done}
        total={model.total}
        filter={filter}
        onFilter={chooseFilter}
        now={now}
        narrow={narrow}
        t={t}
        controls={compact ? <WorkflowTitleControls projectId={projectId} inHeader densities={!narrow} /> : null}
      />
      <p aria-live="polite" className="sr-only">{announce}</p>
      <div className="relative flex min-h-0 flex-1">
        {empty ? (
          <EmptyProject slug={slug} projectId={projectId} t={t} />
        ) : filteredEmpty ? (
          <p className="p-6 text-sm text-muted-foreground">{filter === "needs-you" ? t.empty.nothingNeedsYou : t.empty.nothingMatches}</p>
        ) : narrow ? (
          <div ref={listRef} data-workflow-list className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
            {model.stages.map((stage, index) => hiddenByFilter(columns[index], filter) ? null : (
              <StageColumn
                key={stage.status.id}
                stage={stage}
                rows={columns[index]}
                density="plan"
                views={views}
                selectedKey={selectedKey}
                focusKey={focusKeyOf(columns[index], selectedKey)}
                related={null}
                revealKey={null}
                t={t}
                handlers={handlers}
                onShowDone={(id) => setExpanded((was) => ({ ...was, [id]: { ...was[id], done: true } }))}
                onShowAll={(id) => setExpanded((was) => ({ ...was, [id]: { ...was[id], all: true } }))}
                onOpenParent={(key) => setOpenParents((was) => new Set([...was, key]))}
                stacked
                listScrollRef={listRef}
              />
            ))}
          </div>
        ) : (
          <div ref={boardRef} className="relative flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            {model.stages.map((stage, index) => hiddenByFilter(columns[index], filter) ? null : (
              <StageColumn
                key={stage.status.id}
                stage={stage}
                rows={columns[index]}
                density={density}
                views={views}
                selectedKey={selectedKey}
                focusKey={focusKeyOf(columns[index], selectedKey)}
                related={related}
                revealKey={revealKey}
                t={t}
                handlers={handlers}
                onShowDone={(id) => setExpanded((was) => ({ ...was, [id]: { ...was[id], done: true } }))}
                onShowAll={(id) => setExpanded((was) => ({ ...was, [id]: { ...was[id], all: true } }))}
                onOpenParent={(key) => setOpenParents((was) => new Set([...was, key]))}
              />
            ))}
          </div>
        )}
        {!narrow && !empty && (
          <DependencyLayer boardRef={boardRef} edges={dependencies.edges} labels={{ blocks: t.inspector.blocks, blockedBy: t.inspector.blockedBy }} />
        )}
        {showInspector && selected && (
          <Inspector
            slug={slug}
            projectId={projectId}
            node={selected}
            model={model}
            stages={model.stages.map((stage) => stage.status)}
            agents={providers}
            agent={agent}
            me={me}
            tab={tab}
            onTab={setTab}
            mode={inspectorMode}
            width={inspectorWidth}
            onResize={(width) => setInspectorWidth(person, width)}
            onClose={() => setInspectorOpen(false)}
            onSelect={(key) => select(key, true)}
            onOpen={open}
            onOpenMission={openMission}
            gestures={gestures}
            menuOpen={menuOpen}
            onMenuOpen={setMenuOpen}
            now={now}
            focusRun={focusRun}
            canWrite={canWrite}
          />
        )}
      </div>
      <LegendDialog />
    </div>
  )
}

/** Sous un filtre, une colonne sans résultat ne se montre pas : « Needs you » ne montre que là où l'on vous attend. */
function hiddenByFilter(rows: readonly ColumnRow[], filter: WorkflowFilter | null): boolean {
  return filter !== null && !rows.some((row) => row.type === "node")
}

/** La carte qui prend le focus de sa colonne : le nœud choisi s'il y est, sinon le premier. */
function focusKeyOf(rows: readonly ColumnRow[], selectedKey: string | null): string | null {
  const nodes = rows.filter((row) => row.type === "node")
  if (selectedKey && nodes.some((row) => row.key === selectedKey)) return selectedKey
  return nodes[0]?.key ?? null
}

/** L'agent d'un nœud, tel que la carte et l'inspecteur le montrent. */
function agentView(node: WorkflowNode, agentOf: (key: string) => DeliveryProvider | undefined): NodeAgent | null {
  const run = node.run?.run
  if (!run) return null
  const provider = agentOf(run.providerKey)
  return {
    name: provider?.displayName ?? run.providerKey,
    logoKey: provider?.logoKey ?? null,
    model: MODEL_SHOWN.has(run.providerKey) ? run.model : null,
  }
}

/**
 * La ligne de l'ingénieur (Detail) : le résultat des tests d'abord, qu'une longue branche ne coupe jamais, puis le modèle
 * (s'il n'est pas déjà sur la ligne de l'agent) et la branche. L'agent est sur la ligne 2 : il ne se répète pas.
 */
export function detailLine(node: WorkflowNode, agent: NodeAgent | null, gov: SentenceTexts["workflow"]["gov"]): string | null {
  const run = node.run?.run
  if (!run) return null
  const tests = run.tests?.ran && run.tests.passedCount !== null && run.tests.total !== null
    ? fillText(gov.tests, { passed: run.tests.passedCount, total: run.tests.total })
    : run.tests?.ran ? (run.tests.passed ? gov.testsRan : gov.testsFailed) : null
  const model = agent?.model ? null : (run.model ?? null)
  return [tests, model, node.run?.links.branch ?? null].filter(Boolean).join(" · ") || null
}

/** Ce qu'une carte montre d'un nœud : sa phrase, sa gouvernance, son bouton, son agent, la ligne de l'ingénieur. */
function nodeViewOf(
  node: WorkflowNode,
  texts: SentenceTexts,
  me: string | number | null,
  now: Date,
  agentOf: (key: string) => DeliveryProvider | undefined,
  assigneeOf: Parameters<typeof whoActs>[3],
): NodeView {
  const run = node.run?.run ?? null
  const agent = agentView(node, agentOf)
  const sentence = nodeSentence(node, texts, { me, now })
  const detail = run ? detailLine(node, agent, texts.workflow.gov) : null
  return {
    node,
    sentence,
    governance: governanceOf(node),
    action: nodeAction(node, me),
    agent,
    detail: detail || null,
    who: whoActs(node, me, texts.workflow, assigneeOf),
  }
}

/** Le chargement : des colonnes en squelette, sans roue qui tourne (§10). */
function BoardSkeleton({ density }: Readonly<{ density: Density }>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true">
      <Skeleton className="h-14 w-full rounded-none" />
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
        {Array.from({ length: 4 }).map((_, column) => (
          <div key={column} className="flex shrink-0 flex-col gap-2 px-3" style={{ width: COLUMN_WIDTH[density] }}>
            <Skeleton className="h-5 w-24 rounded-none" />
            {Array.from({ length: 3 }).map((__, row) => <Skeleton key={row} className="h-20 w-full rounded-none" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** L'échec de la lecture : ce qui s'est passé, et quoi faire (R133). */
function LoadFailed({ t, retry }: Readonly<{ t: WorkflowTexts; retry: () => void }>) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-6">
      <p className="text-sm text-foreground">{fillText(t.error.load, { cause: t.error.cause })}</p>
      <Button size="sm" variant="outline" onClick={retry}>{t.error.retry}</Button>
    </div>
  )
}

/** Un projet sans travail : il le dit, et propose d'en créer, sans rien inventer (R15). */
function EmptyProject({ slug, projectId, t }: Readonly<{ slug: string; projectId: number; t: WorkflowTexts }>) {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <p className="text-sm text-foreground">{t.empty.noWork}</p>
      <CreateIssueDialog projectId={projectId} workspaceSlug={slug}>
        <Button size="sm">{t.empty.createIssue}</Button>
      </CreateIssueDialog>
    </div>
  )
}

