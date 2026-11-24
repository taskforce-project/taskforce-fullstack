"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { ArrowLeft, ExternalLink, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { MissionSteps } from "@/components/delivery/mission-steps"
import { DecisionPanel } from "@/components/workflow/decision-panel"
import { NodeMenu, nodeCan, type NodeGestures } from "@/components/workflow/node-gestures"
import { StateMark } from "@/components/workflow/state-mark"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DeliveryProvider, ProjectRun } from "@/lib/api/delivery-service"
import type { IssueStatus } from "@/lib/api/issue-service"
import { approvalOutcome, approvalWords } from "@/lib/delivery/approval-words"
import { missionSequence, requestWant } from "@/lib/delivery/mission-sequence"
import { fillText } from "@/lib/delivery/result-card"
import { describeActivity } from "@/lib/issue-activity"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { isMine } from "@/lib/window/missions"
import { proofLine, proofOf } from "@/lib/window/work-view"
import { issueKey, nextStage, type WorkflowModel, type WorkflowNode } from "@/lib/workflow/model"
import { markStill, pendingOf } from "@/lib/workflow/node-state"
import { countWords, momentWords, nodeSentence } from "@/lib/workflow/sentence"
import type { WorkflowState } from "@/lib/workflow/states"
import { agentLabel, type NodeAgent } from "@/components/workflow/workflow-node"
import { MAX_EDGES } from "@/lib/workflow/view"

export type InspectorTab = "details" | "activity" | "evidence"

/** Les états où le nœud attend quelqu'un ou quelque chose : « Waiting for » dit quoi, et qui. */
// Ce qui attend quelqu'un ou quelque chose ; un nœud bloqué le dit par sa liste « Blocked by », juste dessous.
const WAITS: ReadonlySet<WorkflowState> = new Set<WorkflowState>(["needsYou", "waiting", "missing"])

/** Où vit l'inspecteur : à droite des colonnes, en feuille par-dessus (volet étroit), ou plein écran (fenêtre étroite). */
export type InspectorMode = "side" | "sheet" | "full"

function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-foreground">{children}</dd>
    </div>
  )
}

/**
 * L'inspecteur du nœud choisi (séance n°25, §5) : ancré à droite, 360 px par défaut, de 320 à 560 px par sa poignée (la
 * largeur retenue pour la personne), une région complémentaire ; sous 900 px de volet, une feuille par-dessus les colonnes
 * avec un retour ; sur un écran étroit, plein écran. En-tête : le titre, la marque et le mot de l'état, « Ask about this
 * step », le menu du nœud, la croix. Trois onglets : Details (ce que c'est, qui en répond, ce qui attend, ses liens, ses
 * documents, la décision quand le nœud attend la personne), Activity (le déroulé de la mission, ou l'activité de l'issue),
 * Evidence (la règle, les accords et leurs signatures, les fichiers, la pull request, les tests, la preuve). L'onglet
 * « Definition » viendra avec les processus (W2) : rien ne s'y montrerait encore (R15).
 */
export function Inspector({
  slug, projectId, node, model, stages, agents, agent, me, tab, onTab, mode, width, onResize, onClose, onSelect, onOpen,
  onOpenMission, gestures, menuOpen, onMenuOpen, now, focusRun = null, canWrite = true, screen = false,
}: Readonly<{
  slug: string
  projectId: number
  node: WorkflowNode
  model: WorkflowModel
  stages: readonly IssueStatus[]
  agents: readonly DeliveryProvider[]
  agent: NodeAgent | null
  me: string | number | null | undefined
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
  mode: InspectorMode
  width: number
  onResize: (width: number) => void
  onClose: () => void
  onSelect: (key: string) => void
  onOpen: (node: WorkflowNode) => void
  onOpenMission: (runId: number) => void
  gestures: NodeGestures
  menuOpen: boolean
  onMenuOpen: (open: boolean) => void
  now: Date
  /** Une mission que l'adresse nomme (`run-{id}`) : Activity et Evidence montrent celle-là, même plus ancienne. */
  focusRun?: ProjectRun | null
  /** La personne peut écrire dans le projet : déplacer, confier à un agent. */
  canWrite?: boolean
  /**
   * La fenêtre elle-même est étroite (un téléphone) : la feuille couvre tout l'écran. Sinon (un volet étroit à côté de la
   * conversation), elle couvre la vue entière, en-tête compris, et jamais la conversation.
   */
  screen?: boolean
}>) {
  const t = usePreferencesStore((s) => s.t.workflow)
  const earlier = focusRun !== null && focusRun.run.id !== node.run?.run.id ? focusRun : null
  const shown: WorkflowNode = earlier ? { ...node, run: earlier } : node
  const earlierLine = earlier
    ? (
      <p className="mb-3 text-xs text-muted-foreground">
        {earlier.run.createdAt ? fillText(t.inspector.earlierAt, { time: momentWords(earlier.run.createdAt, now) }) : t.inspector.earlier}
      </p>
    )
    : null
  const word = t.state[node.state]
  const can = nodeCan(node, me, agents, canWrite)

  // En plein écran (un volet étroit, un téléphone), la feuille prend le focus à l'ouverture, et le reprend quand le nœud change
  // sous elle et que le focus s'est perdu : il ne reste jamais derrière elle, sur une carte qu'elle cache (R161, N4).
  const sectionRef = useRef<HTMLElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (mode !== "full") return
    const active = document.activeElement
    if (active && active !== document.body && sectionRef.current?.contains(active)) return
    backRef.current?.focus({ preventScroll: true })
  }, [mode, node.key])

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const move = (e: PointerEvent) => onResize(startWidth + (startX - e.clientX))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <section
      ref={sectionRef}
      aria-label={fillText(t.inspector.region, { title: node.issue.title })}
      data-inspector
      data-mode={mode}
      style={mode === "full" ? undefined : { width }}
      className={cn(
        "flex min-h-0 flex-col bg-background",
        mode === "side" && "relative h-full shrink-0 border-l border-border",
        mode === "sheet" && "absolute inset-y-0 right-0 z-30 max-w-full border-l border-border shadow-xl",
        // L'écran étroit : une feuille sur tout l'écran d'un téléphone, onglets du projet compris ; sur un volet étroit, sur
        // toute la vue, en-tête compris, la conversation restant à côté.
        mode === "full" && (screen ? "fixed inset-0 z-50" : "absolute inset-0 z-30"),
      )}
    >
      {mode === "side" && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t.inspector.resize}
          title={t.inspector.resize}
          onPointerDown={startResize}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-ring/20"
        />
      )}
      {/* L'en-tête : le titre, le menu du nœud et la croix ; dessous, la marque et le mot de l'état, la clé, et « Ask about
          this step ». Deux lignes : rien ne se coupe à 360 px. */}
      <header className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2">
        <div className="flex items-start gap-1">
          {mode !== "side" && (
            <button
              ref={backRef}
              type="button"
              onClick={onClose}
              aria-label={t.inspector.back}
              title={t.inspector.back}
              className="flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          )}
          <h3 className="line-clamp-2 min-w-0 flex-1 px-1 pt-1 text-sm font-[550] text-foreground" title={node.issue.title}>{node.issue.title}</h3>
          <NodeMenu
            node={node}
            stages={stages}
            can={can}
            agents={agents}
            gestures={gestures}
            onOpen={() => onOpen(node)}
            open={menuOpen}
            onOpenChange={onMenuOpen}
          />
          {mode === "side" && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t.inspector.close}
              title={t.inspector.close}
              className="flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2 px-1 text-xs text-muted-foreground">
          <StateMark state={node.state} word={word} still={markStill(node.reason)} showWord className="shrink-0" />
          <span className="shrink-0 whitespace-nowrap font-mono text-subtle">{node.issue.identifier}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={() => gestures.ask(node)}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t.inspector.ask}
          </Button>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(value) => onTab(value as InspectorTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 shrink-0 rounded-none">
          <TabsTrigger value="details" className="rounded-none text-xs">{t.inspector.details}</TabsTrigger>
          <TabsTrigger value="activity" className="rounded-none text-xs">{t.inspector.activity}</TabsTrigger>
          <TabsTrigger value="evidence" className="rounded-none text-xs">{t.inspector.evidence}</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <TabsContent value="details">
            <Details slug={slug} projectId={projectId} node={node} model={model} agents={agents} agent={agent} me={me}
              onSelect={onSelect} onOpen={onOpen} gestures={gestures} can={can} now={now} />
          </TabsContent>
          <TabsContent value="activity">
            {earlierLine}
            <Activity slug={slug} projectId={projectId} node={shown} me={me} />
          </TabsContent>
          <TabsContent value="evidence">
            {earlierLine}
            <Evidence slug={slug} node={shown} onOpenMission={onOpenMission} now={now} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}

/** Une pull request en mots : « Pull request #87 », et non l'adresse ; une adresse d'une autre forme se montre telle quelle. */
export function pullRequestLabel(url: string, words: string): string {
  const number = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url)?.[1]
  return number ? fillText(words, { number }) : url.replace(/^https?:\/\//, "")
}

/** Une liste de liens (« Blocked by », « Blocks ») : des lignes de 36 px, chacune choisit son nœud. */
function LinkList({ items, model, onSelect, more }: Readonly<{
  items: readonly { id: number; identifier: string; title: string }[]
  model: WorkflowModel
  onSelect: (key: string) => void
  more: number
}>) {
  const t = usePreferencesStore((s) => s.t.workflow)
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const other = model.byKey.get(issueKey(item.id))
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(issueKey(item.id))}
              className="flex h-9 w-full items-center gap-2 px-1 text-left text-[13px] hover:bg-muted"
            >
              {other && <StateMark state={other.state} word={t.state[other.state]} still={markStill(other.reason)} />}
              <span className="shrink-0 font-mono text-xs text-subtle">{item.identifier}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
            </button>
          </li>
        )
      })}
      {more > 0 && <li className="px-1 py-1 text-xs text-muted-foreground">{fillText(t.inspector.moreEdges, { count: more })}</li>}
    </ul>
  )
}

function Details({ slug, projectId, node, model, agents, agent, me, onSelect, onOpen, gestures, can, now }: Readonly<{
  slug: string
  projectId: number
  node: WorkflowNode
  model: WorkflowModel
  agents: readonly DeliveryProvider[]
  agent: NodeAgent | null
  me: string | number | null | undefined
  onSelect: (key: string) => void
  onOpen: (node: WorkflowNode) => void
  gestures: NodeGestures
  can: ReturnType<typeof nodeCan>
  now: Date
}>) {
  const t = usePreferencesStore((s) => s.t.workflow)
  const sequence = usePreferencesStore((s) => s.t.missionSequence)
  const rules = usePreferencesStore((s) => s.t.rules)
  const [raw, setRaw] = useState(false)
  const i = t.inspector
  const run = node.run?.run ?? null
  const stage = model.stages.find((s) => s.status.id === node.stageId)?.status.name ?? node.issue.status.name
  const parent = node.issue.parent
  const what = run && agent
    ? fillText(i.whatMission, { stage, agent: agent.name })
    : parent ? fillText(i.whatSubIssue, { parent: parent.identifier, stage }) : fillText(i.whatIssue, { stage })
  const next = nextStage(model, node.stageId)
  const pending = pendingOf(node.run, now)
  // Ce qui attend, et qui : la phrase du nœud quand il attend quelqu'un ou quelque chose.
  const waits = WAITS.has(node.state)
    ? nodeSentence(node, { workflow: t, sequence, rules }, { me, now })
    : node.reason.kind === "blocked"
      ? fillText(t.inspector.blockedWaits, { keys: node.reason.blockers.map((b) => b.identifier).join(", ") })
      : null
  // Les liens vers le haut d'abord, puis vers le bas : cinquante en tout au plus, le reste dit en nombre.
  const upstream = node.blockedBy.slice(0, MAX_EDGES)
  const downstream = node.blocks.slice(0, Math.max(0, MAX_EDGES - upstream.length))
  const hidden = node.blockedBy.length + node.blocks.length - upstream.length - downstream.length
  const ready = agents.filter((a) => a.available && a.ready)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-foreground">{what}</p>

      {node.reason.kind === "approval" && run && (
        <DecisionPanel slug={slug} projectId={projectId} run={run} approval={node.reason.approval} now={now}
          agent={agents.find((a) => a.key === run.providerKey)?.displayName ?? null} />
      )}
      {node.reason.kind === "review" && (
        <div className="flex items-center justify-between gap-2 border border-border bg-card p-3">
          <p className="text-[13px] text-foreground">{t.now.review}</p>
          <Button size="sm" onClick={() => onOpen(node)}>{t.action.review}</Button>
        </div>
      )}
      {node.reason.kind === "failed" && (
        <div className="flex flex-col gap-2 border border-destructive/40 bg-card p-3">
          <p className="text-[13px] text-foreground">{node.reason.cause ?? t.now.failedNoCause}</p>
          {can.retry && (
            <Button size="sm" className="w-fit self-end" onClick={() => void gestures.retry(node)}>{t.gesture.retry}</Button>
          )}
        </div>
      )}
      {node.reason.kind === "waitingApproval" && run && pending[0] && (
        <DecisionPanel slug={slug} projectId={projectId} run={run} approval={pending[0]} now={now}
          agent={agents.find((a) => a.key === run.providerKey)?.displayName ?? null} />
      )}

      <dl className="flex flex-col gap-3">
        <Row label={i.answersFor}>{node.issue.assignee ? (node.issue.assignee.displayName ?? node.issue.assignee.email) : i.nobody}</Row>
        <Row label={i.doneBy}>{agent ? agentLabel(agent) : i.noAgent}</Row>
        <Row label={i.waitsFor}>{waits ?? i.nothingWaits}</Row>
        <Row label={i.next}>{next ? next.name : i.lastStage}</Row>
        {upstream.length > 0 && (
          <Row label={i.blockedBy}><LinkList items={upstream} model={model} onSelect={onSelect} more={0} /></Row>
        )}
        {downstream.length > 0 && (
          <Row label={i.blocks}><LinkList items={downstream} model={model} onSelect={onSelect} more={hidden} /></Row>
        )}
        <Row label={i.documents}>
          {node.documents > 0 ? (
            <button type="button" onClick={() => onOpen(node)} className="text-left underline-offset-2 hover:underline">
              {countWords(node.documents, t.gov.documentsOne, t.gov.documentsMany)}
            </button>
          ) : i.noDocuments}
        </Row>
      </dl>

      {can.handToAgent && ready.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {ready.map((a) => (
            <Button key={a.key} variant="outline" size="sm" className="h-7 text-xs" onClick={() => void gestures.handTo(node, a)}>
              {fillText(t.gesture.handTo, { agent: a.displayName })}
            </Button>
          ))}
        </div>
      )}
      {/* Sans agent prêt, le geste ne disparaît pas sans rien dire : la phrase dit quoi faire. */}
      {can.handable && ready.length === 0 && <p className="text-xs text-muted-foreground">{t.gesture.noAgentReady}</p>}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => onOpen(node)} className="text-ink-blue underline-offset-2 hover:underline">{i.openIssue}</button>
        <button type="button" onClick={() => setRaw((was) => !was)} aria-expanded={raw} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {raw ? i.hideRaw : i.showRaw}
        </button>
      </div>
      {raw && (
        <pre tabIndex={0} className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">
          {JSON.stringify({ issue: node.issue, mission: node.run }, null, 2)}
        </pre>
      )}
    </div>
  )
}

function Activity({ slug, projectId, node, me }: Readonly<{
  slug: string
  projectId: number
  node: WorkflowNode
  me: string | number | null | undefined
}>) {
  const t = usePreferencesStore((s) => s.t.workflow.inspector)
  const sequenceTexts = usePreferencesStore((s) => s.t.missionSequence)
  const activityTexts = usePreferencesStore((s) => s.t.issueActivity)
  const run = node.run?.run ?? null
  const runActivity = useDeliveryStore((s) => (run ? s.activity[run.id] : undefined))
  const fetchActivity = useDeliveryStore((s) => s.fetchActivity)
  const issueActivity = useIssueStore((s) => s.issueActivity[node.issue.id])
  const fetchIssueActivity = useIssueStore((s) => s.fetchIssueActivity)
  const [showCommands, setShowCommands] = useState(false)
  const [failed, setFailed] = useState(false)
  const runId = run?.id ?? null
  const issueId = node.issue.id

  useEffect(() => {
    let cancelled = false
    const read = runId !== null ? fetchActivity(slug, runId) : fetchIssueActivity(slug, projectId, issueId)
    void read.then((result) => { if (!cancelled) setFailed(result === null) })
    return () => { cancelled = true }
  }, [slug, projectId, runId, issueId, fetchActivity, fetchIssueActivity])

  if (run) {
    const sequence = missionSequence(run, runActivity, sequenceTexts, isMine(run, me))
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-foreground">{sequence.status}</p>
        <MissionSteps steps={sequence.steps} showCommands={showCommands} />
        <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showCommands} onChange={(event) => setShowCommands(event.target.checked)} />
          {sequenceTexts.showCommands}
        </label>
        {failed && <p className="text-xs text-destructive">{t.activityFailed}</p>}
      </div>
    )
  }
  if (!issueActivity) return <p className="text-xs text-muted-foreground">{failed ? t.activityFailed : t.loadingActivity}</p>
  if (issueActivity.length === 0) return <p className="text-xs text-muted-foreground">{t.noActivity}</p>
  return (
    <ol className="flex flex-col gap-2">
      {issueActivity.map((entry) => {
        const line = describeActivity(entry, activityTexts)
        return (
          <li key={entry.id} className="text-xs leading-5">
            <span className="font-medium text-foreground">{line.who}</span>{" "}
            <span className="text-muted-foreground">{line.what}</span>
            {line.change && <span className="text-muted-foreground">: {line.change.from} → {line.change.to}</span>}
            {line.forWhom && <span className="text-muted-foreground"> {line.forWhom}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Evidence({ slug, node, onOpenMission, now }: Readonly<{
  slug: string
  node: WorkflowNode
  onOpenMission: (runId: number) => void
  now: Date
}>) {
  const t = usePreferencesStore((s) => s.t.workflow.inspector)
  const missions = usePreferencesStore((s) => s.t.missions)
  const sequenceTexts = usePreferencesStore((s) => s.t.missionSequence)
  const run = node.run?.run ?? null
  const runId = run?.id ?? null
  const evidence = useDeliveryStore((s) => (runId !== null ? s.evidence[runId] : undefined))
  const changes = useDeliveryStore((s) => (runId !== null ? s.missionChanges[runId] : undefined))
  const activity = useDeliveryStore((s) => (runId !== null ? s.activity[runId] : undefined))
  const fetchEvidence = useDeliveryStore((s) => s.fetchEvidence)
  const fetchMissionChanges = useDeliveryStore((s) => s.fetchMissionChanges)
  const downloadEvidence = useDeliveryStore((s) => s.downloadEvidence)

  useEffect(() => {
    if (runId === null) return
    void fetchEvidence(slug, runId)
    void fetchMissionChanges(slug, runId)
  }, [slug, runId, fetchEvidence, fetchMissionChanges])

  if (!run) return <p className="text-xs text-muted-foreground">{t.noMission}</p>

  const approvals = activity?.approvals ?? node.run?.approvals ?? []
  const rules = [...new Set(approvals.map((approval) => approval.reason?.trim()).filter((reason): reason is string => Boolean(reason)))]
  const pr = node.run?.links.pullRequestUrl ?? null
  const tests = run.tests
  // La ligne de la preuve de la vue du travail : finir ne scelle pas, et une clé que l'agent lisait se dit (R161 M5).
  const proof = proofLine(proofOf(evidence), sequenceTexts.proof)

  async function download() {
    if (runId === null) return
    const ok = await downloadEvidence(slug, runId, "json")
    if (ok) toast.success(t.downloaded)
    else toast.error(t.downloadFailed)
  }

  return (
    <dl className="flex flex-col gap-4">
      <Row label={t.rule}>
        <div className="flex flex-col gap-1">
          {rules.length > 0 ? rules.map((rule) => <p key={rule}>{rule}</p>) : <p className="text-muted-foreground">{t.noRule}</p>}
          {typeof run.rulesVersion === "number" && (
            <p className="text-xs text-muted-foreground">{fillText(t.rulesVersion, { version: run.rulesVersion })}</p>
          )}
        </div>
      </Row>
      <Row label={t.approvals}>
        {approvals.length === 0 ? <p className="text-muted-foreground">{t.noApprovals}</p> : (
          <ul className="flex flex-col gap-2">
            {approvals.map((approval) => {
              const words = approvalWords(approval, missions, requestWant(approval, run, sequenceTexts))
              const outcome = approvalOutcome(approval, missions)
              return (
                <li key={approval.id} className="flex flex-col gap-0.5">
                  <span>{words.title}</span>
                  {outcome && <span className="text-xs text-muted-foreground">{outcome}</span>}
                  {(approval.signedBy ?? []).map((who, index) => {
                    // L'heure de cette signature-là : la décision finale n'a que l'heure de la dernière.
                    const at = approval.signedAt?.[index] ?? null
                    return (
                      <span key={`${who}-${index}`} className="text-xs text-muted-foreground">
                        {at ? fillText(t.signedBy, { who, time: momentWords(at, now) }) : fillText(t.signedByUndated, { who })}
                      </span>
                    )
                  })}
                </li>
              )
            })}
          </ul>
        )}
      </Row>
      <Row label={t.files}>
        {!changes || changes.files.length === 0 ? <p className="text-muted-foreground">{t.noFiles}</p> : (
          <ul className="flex flex-col">
            {changes.files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => onOpenMission(run.id)}
                  className="flex h-8 w-full items-center gap-2 px-1 text-left text-xs hover:bg-muted"
                  title={file.path}
                >
                  <span className="min-w-0 flex-1 truncate font-mono">{file.path.split("/").at(-1)}</span>
                  {file.added !== null && <span className="shrink-0 font-mono text-ink-green">+{file.added}</span>}
                  {file.removed !== null && <span className="shrink-0 font-mono text-destructive">−{file.removed}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Row>
      {pr && (
        <Row label={t.pullRequest}>
          <a href={pr} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-blue underline-offset-2 hover:underline">
            {pullRequestLabel(pr, t.pullRequestNumber)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </Row>
      )}
      {tests && (
        <Row label={t.tests}>
          {tests.ran
            ? (tests.passedCount !== null && tests.total !== null
              ? fillText(tests.passed ? sequenceTexts.tests.passedCount : sequenceTexts.tests.failedCount, { passed: tests.passedCount, total: tests.total })
              : (tests.passed ? sequenceTexts.tests.passed : sequenceTexts.tests.failed))
            : sequenceTexts.tests.notRun}
        </Row>
      )}
      <Row label={sequenceTexts.proof.name}>
        {evidence ? (
          <div className="flex flex-col gap-1.5">
            <p>{proof}</p>
            <Button variant="outline" size="sm" className="h-7 w-fit text-xs" onClick={() => void download()}>{t.download}</Button>
          </div>
        ) : <p className="text-muted-foreground">{t.noEvidence}</p>}
      </Row>
    </dl>
  )
}
