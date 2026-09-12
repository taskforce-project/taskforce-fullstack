"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeProps, type ColorMode,
} from "@xyflow/react"
import { Bot, FileText, GitBranch, Layers } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AnalysisJob } from "@/lib/api/analysis-service"
import type { PlanTask } from "@/components/ui/agent-plan"
import type { DeliveryProvider, DeliveryRun } from "@/lib/api/delivery-service"

// NB : la CSS de React Flow est importee dans app/globals.css APRES tailwindcss (ordre requis Tailwind v4).

// ─── Statut unifie (plan d'analyse + job + run de delegation) -> couleur/libelle. ───
type Tone = "done" | "running" | "waiting" | "failed" | "idle"
const TONE_COLOR: Record<Tone, string> = {
  done: "#10b981", running: "#3b82f6", waiting: "#f59e0b", failed: "#f43f5e", idle: "#8a8f98",
}
function toneOf(status: string | undefined): Tone {
  switch (status) {
    case "completed": case "DONE": return "done"
    case "in-progress": case "RUNNING": return "running"
    case "need-help": case "WAITING_FOR_INPUT": return "waiting"
    case "failed": case "FAILED": return "failed"
    default: return "idle" // pending / QUEUED / null
  }
}
const statusLabel = (s?: string) => (s ?? "").toLowerCase().replace(/_/g, " ") || "pending"

// ─── Noeud du canvas (kind = job / task / agent / run). Style aux tokens de l'app (theme auto). ───
type NodeKind = "job" | "task" | "agent" | "run"
interface FlowData extends Record<string, unknown> {
  kind: NodeKind
  title: string
  sub?: string
  tone: Tone
  status?: string
  ref?: number // id metier (job/issue) pour la navigation
}

const KIND_ICON = { job: Layers, task: GitBranch, agent: Bot, run: FileText } as const

function FlowNode({ data, selected }: NodeProps<Node<FlowData>>) {
  const Icon = KIND_ICON[data.kind]
  const color = TONE_COLOR[data.tone]
  const isContainer = data.kind === "job" || data.kind === "agent"
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-[var(--card)] py-2 pl-2 pr-3 text-left shadow-sm transition-shadow",
        selected ? "ring-2 ring-[var(--primary)]" : "hover:shadow-md",
      )}
      style={{ borderLeft: `3px solid ${color}`, width: isContainer ? 210 : 190 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${color}1f`, color }}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px] leading-tight text-[var(--foreground)]", isContainer && "font-semibold")}>{data.title}</p>
        <p className="flex items-center gap-1 truncate text-[10px] text-[var(--muted-foreground)]">
          {data.sub && <span className="truncate">{data.sub}</span>}
          {data.sub && <span aria-hidden>·</span>}
          <span style={{ color }}>{statusLabel(data.status)}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  )
}

const nodeTypes = { flow: FlowNode }

// ─── Layout deterministe : bandes (1 job = 1 bande, taches en colonnes par niveau de dependance),
// puis une region « delegations » (issues -> agents). Overlap-free (chaque colonne empile). ───
const COL_W = 240, ROW_H = 84, BAND_GAP = 56

/** Niveau topologique d'une tache dans le plan (0 = racine), anti-cycle. */
function computeLevels(tasks: PlanTask[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const level = new Map<string, number>()
  const visiting = new Set<string>()
  const walk = (id: string): number => {
    if (level.has(id)) return level.get(id)!
    if (visiting.has(id)) return 0 // cycle -> coupe
    visiting.add(id)
    const deps = (byId.get(id)?.dependencies ?? []).filter((d) => byId.has(d) && d !== id)
    const lvl = deps.length ? 1 + Math.max(...deps.map(walk)) : 0
    visiting.delete(id)
    level.set(id, lvl)
    return lvl
  }
  for (const t of tasks) walk(t.id)
  return level
}

interface BuildInput { jobs: AnalysisJob[]; runs: DeliveryRun[]; providers: DeliveryProvider[] }
function buildFlow({ jobs, runs, providers }: BuildInput): { nodes: Node<FlowData>[]; edges: Edge[] } {
  const nodes: Node<FlowData>[] = []
  const edges: Edge[] = []
  let cursorY = 0
  const edge = (id: string, source: string, target: string, tone: Tone): Edge => ({
    id, source, target, type: "smoothstep",
    animated: tone === "running",
    style: { stroke: TONE_COLOR[tone], strokeWidth: 1.5, opacity: tone === "idle" ? 0.4 : 0.8 },
  })

  // ── Region A : workflows d'analyse (plan = DAG). ──
  for (const job of jobs) {
    const jobId = `job-${job.id}`
    const tasks = job.plan ?? []
    const levels = computeLevels(tasks)
    const rowInCol = new Map<number, number>() // compteur de ligne par colonne (empilage sans chevauchement)
    const posOf = new Map<string, { x: number; y: number }>()
    const colCounts = new Map<number, number>()
    for (const t of tasks) colCounts.set(levels.get(t.id) ?? 0, (colCounts.get(levels.get(t.id) ?? 0) ?? 0) + 1)
    const bandRows = Math.max(1, ...colCounts.values())
    const bandH = bandRows * ROW_H

    nodes.push({
      id: jobId, type: "flow", position: { x: 0, y: cursorY + bandH / 2 - ROW_H / 2 },
      data: { kind: "job", title: job.projectName, sub: job.depth === "DEEP" ? "Deep analysis" : "Quick analysis", tone: toneOf(job.status), status: job.status, ref: job.projectId },
    })

    for (const t of tasks) {
      const col = levels.get(t.id) ?? 0
      const r = rowInCol.get(col) ?? 0
      rowInCol.set(col, r + 1)
      const colCount = colCounts.get(col) ?? 1
      const x = (col + 1) * COL_W + 40
      const y = cursorY + (bandH - colCount * ROW_H) / 2 + r * ROW_H // colonne centree verticalement dans la bande
      posOf.set(t.id, { x, y })
      const done = t.subtasks?.filter((s) => s.status === "completed").length ?? 0
      const sub = t.subtasks?.length ? `${done}/${t.subtasks.length} steps` : undefined
      nodes.push({ id: `task-${job.id}-${t.id}`, type: "flow", position: { x, y }, data: { kind: "task", title: t.title, sub, tone: toneOf(t.status), status: t.status } })
      const deps = (t.dependencies ?? []).filter((d) => posOf.has(d) || tasks.some((x) => x.id === d))
      if (deps.length === 0) edges.push(edge(`e-${jobId}-${t.id}`, jobId, `task-${job.id}-${t.id}`, toneOf(t.status)))
      for (const d of deps) edges.push(edge(`e-${job.id}-${d}-${t.id}`, `task-${job.id}-${d}`, `task-${job.id}-${t.id}`, toneOf(t.status)))
    }
    cursorY += bandH + BAND_GAP
  }

  // ── Region B : delegations (issue -> agent), agents en colonne. ──
  if (runs.length) {
    const nameOf = new Map(providers.map((p) => [p.key, p.displayName]))
    const agentKeys = [...new Set(runs.map((r) => r.providerKey))]
    const baseY = cursorY + 20
    agentKeys.forEach((key, i) => {
      nodes.push({ id: `agent-${key}`, type: "flow", position: { x: COL_W * 2 + 40, y: baseY + i * ROW_H * 1.6 }, data: { kind: "agent", title: nameOf.get(key) ?? key, sub: "agent", tone: "idle" } })
    })
    runs.forEach((run, i) => {
      const rid = `run-${run.id}`
      const tone = toneOf(run.status)
      nodes.push({ id: rid, type: "flow", position: { x: COL_W * 0.4, y: baseY + i * ROW_H }, data: { kind: "run", title: `Issue #${run.issueId}`, sub: run.model ?? undefined, tone, status: run.status, ref: run.issueId } })
      edges.push(edge(`e-${rid}`, rid, `agent-${run.providerKey}`, tone))
    })
  }

  return { nodes, edges }
}

/** Detecte le theme applique par l'app (classe `.dark`) pour aligner le chrome React Flow. */
function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>("light")
  useEffect(() => {
    const read = () => setMode(document.documentElement.classList.contains("dark") ? "dark" : "light")
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [])
  return mode
}

interface WorkflowCanvasProps {
  jobs: AnalysisJob[]
  runs: DeliveryRun[]
  providers: DeliveryProvider[]
  /** Clic sur un noeud portant un id metier : job/run -> ouvre la ressource (projet Intelligence / issue). */
  onSelectProject?: (projectId: number) => void
  onSelectIssue?: (issueId: number) => void
}

/**
 * Canvas React Flow unifie du « workflow IA » : les workflows d'analyse (plan = DAG tache/dependance)
 * ET les delegations vers agents (issue -> agent, plusieurs en parallele), avec statut live et couleurs.
 * Presentation pure : recoit les donnees reelles (stores), aucune mutation.
 */
export function WorkflowCanvas({ jobs, runs, providers, onSelectProject, onSelectIssue }: Readonly<WorkflowCanvasProps>) {
  const colorMode = useColorMode()
  const { nodes, edges } = useMemo(() => buildFlow({ jobs, runs, providers }), [jobs, runs, providers])

  const onNodeClick = useCallback((_: unknown, node: Node<FlowData>) => {
    if (node.data.kind === "job" && node.data.ref != null) onSelectProject?.(node.data.ref)
    else if (node.data.kind === "run" && node.data.ref != null) onSelectIssue?.(node.data.ref)
  }, [onSelectProject, onSelectIssue])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--muted)]/20 px-6 text-center">
        <Layers className="size-8 text-[var(--muted-foreground)]/40" />
        <p className="text-sm font-medium text-[var(--foreground)]">No AI workflow yet</p>
        <p className="max-w-xs text-xs text-[var(--muted-foreground)]">
          Launch an analysis from a project, or delegate a task to an agent - it shows up here as a live graph.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={onNodeClick}
      >
        <Background gap={22} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={(n) => TONE_COLOR[(n.data as FlowData)?.tone ?? "idle"]} maskColor="rgba(0,0,0,0.06)" />
      </ReactFlow>
    </div>
  )
}
