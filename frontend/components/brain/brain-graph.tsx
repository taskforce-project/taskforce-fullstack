"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d"
import { Maximize2 } from "lucide-react"
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/api/brain-service"

// ─── Couleur : une teinte par projet (branche de 1er niveau). ──────────────────
const PROJECT_HUE = [210, 165, 38, 330, 262, 8, 142, 28, 190, 300]
function hsl(hue: number, s: number, l: number): string {
  return `hsl(${(((hue % 360) + 360) % 360).toFixed(0)}, ${s}%, ${l}%)`
}
const FINDING_RED = "#e0584d"
const ENTRANCE_MS = 600

interface Pt { x: number; y: number }

/** Rampe douce 0→1 entre deux niveaux de zoom (fondu des labels et des niveaux profonds). */
function fade(scale: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (scale - a) / (b - a)))
}

type Shape = "circle" | "diamond" | "triangle" | "hexagon"
function shapeOf(ntype?: string): Shape {
  switch (ntype) {
    case "ADR": case "DECISION": return "diamond"
    case "FINDING": return "triangle"
    case "RUNBOOK": case "SOP": return "hexagon"
    default: return "circle"
  }
}
function tracePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  ctx.beginPath()
  if (shape === "diamond") {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath()
  } else if (shape === "triangle") {
    const h = r * 1.2
    ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.87, y + h * 0.55); ctx.lineTo(x - h * 0.87, y + h * 0.55); ctx.closePath()
  } else if (shape === "hexagon") {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.closePath()
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
}

interface GraphNode extends NodeObject {
  id: string
  ref?: number
  label: string
  color: string
  depth: number
  hasChildren: boolean
  ntype?: string
  archived?: boolean
  deg: number
}
interface GraphLink extends LinkObject {
  source: string
  target: string
  kind: "struct" | "edge" | "auto"
}

interface ThemeColors { fg: string; muted: string; primary: string; bg: string }
function readTheme(el: HTMLElement | null): ThemeColors {
  const cs = el ? getComputedStyle(el) : null
  const v = (n: string, fb: string) => {
    const raw = cs?.getPropertyValue(n).trim()
    if (!raw) return fb
    return /^(#|rgb|hsl|oklch|lab|color|[a-z])/.test(raw) ? raw : `hsl(${raw})`
  }
  return {
    fg: v("--foreground", "#1d1d1f"),
    muted: v("--muted-foreground", "#8a8f98"),
    primary: v("--primary", "#6366f1"),
    bg: v("--background", "#ffffff"),
  }
}

/** Ce que le graphe a besoin de savoir d'un projet - pas plus (découplé de `Project`). */
export interface GraphProject {
  id: number
  name: string
  identifier: string
}

interface BrainGraphProps {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  selectedNodeId: number | null
  onSelect: (id: number) => void
  /** Projets du workspace (conservé pour compat ; la couleur vient désormais de la hiérarchie). */
  projects?: GraphProject[]
  includeTags?: boolean
  onSelectTag?: (tag: string) => void
  activeTag?: string | null
}

/**
 * Constellation radiale du Brain OS. La **hiérarchie de containment** (`parentNodeId`) EST le dessin :
 * le hub « Brain OS » au centre, ses projets en 1re couronne, leurs systèmes/sous-systèmes/notes en
 * rayons successifs. Chaque projet porte une teinte, ses descendants en héritent. Placement
 * **déterministe** (rayon = profondeur, secteur angulaire ∝ nombre de feuilles) : mêmes données = même
 * dessin, aucune simulation. Niveau de détail piloté par le zoom : les notes s'estompent en vue
 * d'ensemble et se révèlent quand on zoome (« le rich apparaît au scroll »).
 */
export function BrainGraph({
  nodes, edges, selectedNodeId, onSelect,
}: BrainGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const bornAtRef = useRef<Map<string, number>>(new Map())
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [theme, setTheme] = useState<ThemeColors>(() => readTheme(null))
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    setTheme(readTheme(el))
    const mo = new MutationObserver(() => setTheme(readTheme(el)))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  // ── Layout radial par containment (parentNodeId). Positions FIXES, déterministes. ──
  const data = useMemo(() => {
    const byId = new Map<number, KnowledgeNode>()
    for (const n of nodes) if (!n.system) byId.set(n.id, n)

    // Racine = le hub « Brain OS » (le gabarit le pose en racine, projets nichés dessous). Repli : la
    // première racine si le hub n'existe pas.
    const hub = [...byId.values()].find((n) => n.title === "Brain OS")
      ?? [...byId.values()].find((n) => n.parentNodeId == null || !byId.has(n.parentNodeId))
      ?? null

    // Enfants par parent (containment via parentNodeId). Les racines orphelines (docs globaux sans
    // parent) se raccrochent au hub → une seule constellation connectée, jamais d'îlots.
    const childrenOf = new Map<number, number[]>()
    const parentOf = new Map<number, number>()
    for (const n of byId.values()) {
      if (hub && n.id === hub.id) continue
      const raw = n.parentNodeId
      const pid = raw != null && byId.has(raw) ? raw : hub ? hub.id : null
      if (pid == null) continue
      parentOf.set(n.id, pid)
      const arr = childrenOf.get(pid)
      if (arr) arr.push(n.id); else childrenOf.set(pid, [n.id])
    }
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => (byId.get(a)?.title ?? "").localeCompare(byId.get(b)?.title ?? ""))
    }

    // Feuilles par sous-arbre → largeur angulaire allouée à chacun.
    const leafCount = new Map<number, number>()
    const countLeaves = (id: number): number => {
      const ch = childrenOf.get(id) ?? []
      if (ch.length === 0) { leafCount.set(id, 1); return 1 }
      let s = 0; for (const c of ch) s += countLeaves(c)
      const v = s || 1; leafCount.set(id, v); return v
    }

    // Placement radial : rayon = profondeur, secteur ∝ feuilles. Brain OS au centre, puis projets,
    // systèmes, notes en rayons. Récursif, anti-cycle par `seen`.
    const RING = 92
    const depthOf = new Map<number, number>()
    const posById = new Map<number, Pt>()
    const seen = new Set<number>()
    const place = (id: number, depth: number, a0: number, a1: number) => {
      if (seen.has(id)) return
      seen.add(id)
      depthOf.set(id, depth)
      const a = (a0 + a1) / 2
      posById.set(id, { x: Math.cos(a) * depth * RING, y: Math.sin(a) * depth * RING })
      const ch = childrenOf.get(id) ?? []
      const total = leafCount.get(id) ?? 1
      let acc = a0
      for (const c of ch) {
        const span = (a1 - a0) * ((leafCount.get(c) ?? 1) / total)
        place(c, depth + 1, acc, acc + span)
        acc += span
      }
    }
    if (hub) { countLeaves(hub.id); place(hub.id, 0, 0, Math.PI * 2) }

    // Couleur : une teinte par PROJET (enfant direct du hub qui a lui-même des enfants). Descendants
    // héritent. Hub = neutre ; docs globaux (feuilles de 1er niveau) = gris.
    const hueByNode = new Map<number, string>()
    const legend: { id: string; name: string; color: string }[] = []
    const topChildren = hub ? childrenOf.get(hub.id) ?? [] : []
    let projIdx = 0
    for (const cid of topChildren) {
      if ((childrenOf.get(cid)?.length ?? 0) === 0) continue // doc global (feuille) → neutre
      const color = hsl(PROJECT_HUE[projIdx++ % PROJECT_HUE.length], 58, 55)
      const short = (byId.get(cid)?.title ?? "").split(" › ").pop() ?? ""
      legend.push({ id: `n${cid}`, name: short, color })
      const stack = [cid]
      while (stack.length) {
        const id = stack.pop()!
        hueByNode.set(id, color)
        for (const c of childrenOf.get(id) ?? []) stack.push(c)
      }
    }

    const childCount = new Map<number, number>()
    for (const [pid, ch] of childrenOf) childCount.set(pid, ch.length)

    const gNodes: GraphNode[] = []
    for (const [id, at] of posById) {
      const node = byId.get(id)
      if (!node) continue
      const archived = node.status === "ARCHIVED" || node.domain === "ARCHIVE"
      const color = hub && id === hub.id ? theme.fg : hueByNode.get(id) ?? theme.muted
      gNodes.push({
        id: `n${node.id}`, ref: node.id, label: node.title,
        color: archived ? theme.muted : color,
        depth: depthOf.get(id) ?? 0, hasChildren: (childCount.get(id) ?? 0) > 0,
        ntype: node.type, archived, deg: 0, fx: at.x, fy: at.y, x: at.x, y: at.y,
      } as GraphNode)
    }

    // Liens : la hiérarchie (parent → enfant = « struct », dendrogramme radial) + les wikilinks
    // (transverses, faibles). La hiérarchie porte la lecture ; les transverses sont le liant.
    const present = new Set(gNodes.map((n) => n.id))
    const gLinks: GraphLink[] = []
    const degree = new Map<string, number>()
    const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)
    for (const [cid, pid] of parentOf) {
      const s = `n${cid}`, t = `n${pid}`
      if (present.has(s) && present.has(t)) { gLinks.push({ source: s, target: t, kind: "struct" }); bump(s); bump(t) }
    }
    for (const e of edges) {
      const s = `n${e.fromNodeId}`, t = `n${e.toNodeId}`
      if (!present.has(s) || !present.has(t) || s === t) continue
      gLinks.push({ source: s, target: t, kind: e.auto ? "auto" : "edge" }); bump(s); bump(t)
    }
    for (const gn of gNodes) gn.deg = degree.get(gn.id) ?? 0
    return { nodes: gNodes, links: gLinks, legend }
  }, [nodes, edges, theme])

  const neighbors = useMemo(() => {
    if (!hoverId) return null
    const set = new Set<string>([hoverId])
    for (const l of data.links) {
      const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source
      const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target
      if (s === hoverId) set.add(t as string)
      if (t === hoverId) set.add(s as string)
    }
    return set
  }, [hoverId, data])

  const selId = selectedNodeId != null ? `n${selectedNodeId}` : null
  const radiusOf = useCallback((n: GraphNode) => (n.depth === 0 ? 10 : n.hasChildren ? Math.max(4, 8.5 - n.depth * 1.1) : 2.8) + Math.min(3, Math.sqrt(n.deg) * 0.5), [])

  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const x = node.x ?? 0, y = node.y ?? 0
    let bornAt = bornAtRef.current.get(node.id)
    if (bornAt == null) { bornAt = performance.now(); bornAtRef.current.set(node.id, bornAt) }
    const age = performance.now() - bornAt
    const enter = age >= ENTRANCE_MS ? 1 : 1 - Math.pow(1 - age / ENTRANCE_MS, 3)
    const r = radiusOf(node) * (0.4 + 0.6 * enter)
    const isFocus = node.id === hoverId || node.id === selId
    const dim = neighbors != null && !neighbors.has(node.id)
    const shape = node.hasChildren ? "circle" : shapeOf(node.ntype)
    // Niveau de détail : les profondeurs (notes) sont estompées en vue d'ensemble et se révèlent au
    // zoom. Les 3 premiers niveaux (Brain OS, projets, systèmes) restent pleins. Un nœud focus reste plein.
    const lod = isFocus ? 1 : node.depth <= 2 ? 1 : node.depth === 3 ? fade(scale, 0.7, 1.6) : fade(scale, 1.3, 2.5)

    ctx.save()
    ctx.globalAlpha = (dim ? 0.12 : node.archived ? 0.55 : 1) * enter * (0.16 + 0.84 * lod)
    if (!dim && !node.archived) { ctx.shadowColor = node.color; ctx.shadowBlur = isFocus ? 16 : node.hasChildren ? 7 : 3 }
    tracePath(ctx, shape, x, y, r); ctx.fillStyle = node.color; ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = (isFocus ? 2.2 : 1) / scale
    ctx.strokeStyle = isFocus ? theme.primary : node.ntype === "FINDING" && !node.hasChildren ? FINDING_RED : theme.bg
    ctx.stroke()

    // Labels : taille écran fixe, fondu par le zoom (apparition par niveau). Titre court (dernier segment).
    const isNeighbor = neighbors != null && neighbors.size <= 22 && neighbors.has(node.id)
    let labelA: number
    if (dim) labelA = 0
    else if (isFocus || isNeighbor) labelA = 1
    else if (node.depth === 0) labelA = 1
    else if (node.depth === 1) labelA = node.hasChildren ? 1 : fade(scale, 1.2, 1.7)
    else if (node.depth === 2) labelA = fade(scale, 1.1, 1.7)
    else if (node.depth === 3) labelA = fade(scale, 1.9, 2.6)
    else labelA = fade(scale, 3.0, 3.7)
    if (labelA > 0.03) {
      const fs = Math.max(1.6, (node.depth === 0 ? 13 : node.depth === 1 ? 12 : node.depth === 2 ? 11 : 10) / scale)
      ctx.font = `${node.hasChildren ? 600 : 400} ${fs}px ui-sans-serif, system-ui, sans-serif`
      ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.direction = "ltr"; ctx.lineJoin = "round"
      const raw = node.label.includes(" › ") ? node.label.slice(node.label.lastIndexOf(" › ") + 3) : node.label
      const label = raw.length > 30 ? raw.slice(0, 29) + "…" : raw
      const lx = x + r + 4 / scale
      ctx.lineWidth = 3.2 / scale; ctx.strokeStyle = theme.bg
      ctx.globalAlpha = labelA * 0.95
      ctx.strokeText(label, lx, y)
      ctx.fillStyle = theme.fg
      ctx.fillText(label, lx, y)
    }
    ctx.restore()
  }, [radiusOf, hoverId, selId, neighbors, theme])

  const paintPointer = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(node.x ?? 0, node.y ?? 0, Math.max(6, radiusOf(node) + 4), 0, Math.PI * 2); ctx.fill()
  }, [radiusOf])

  const linkColor = useCallback((l: GraphLink) => {
    const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source
    const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target
    if (hoverId) return s === hoverId || t === hoverId ? theme.primary : "rgba(140,140,150,0.02)"
    if (l.kind === "struct") return "rgba(150,150,165,0.16)"
    return "rgba(150,150,165,0.05)" // transverse (wikilink) : très discret, le liant, pas la structure
  }, [hoverId, theme])

  // Arêtes façon dendrogramme radial : structurelles = courbes radiales (parent → enfant, s'évasent
  // le long du rayon) ; transverses = bundlées vers le centre.
  const drawLink = useCallback((l: GraphLink, ctx: CanvasRenderingContext2D, scale: number) => {
    const s = l.source as unknown as GraphNode, t = l.target as unknown as GraphNode
    if (s?.x == null || s?.y == null || t?.x == null || t?.y == null) return
    ctx.strokeStyle = linkColor(l)
    ctx.lineWidth = (hoverId ? 1.4 : l.kind === "struct" ? 0.7 : 0.5) / scale
    ctx.beginPath()
    if (l.kind === "struct") {
      ctx.setLineDash([])
      const rp = Math.hypot(s.x, s.y), ap = Math.atan2(s.y, s.x)
      const rc = Math.hypot(t.x, t.y), ac = Math.atan2(t.y, t.x)
      const mid = (rp + rc) / 2
      ctx.moveTo(s.x, s.y)
      ctx.bezierCurveTo(Math.cos(ap) * mid, Math.sin(ap) * mid, Math.cos(ac) * mid, Math.sin(ac) * mid, t.x, t.y)
    } else {
      ctx.setLineDash([2 / scale, 3 / scale])
      ctx.moveTo(s.x, s.y)
      ctx.quadraticCurveTo((s.x + t.x) * 0.16, (s.y + t.y) * 0.16, t.x, t.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }, [linkColor, hoverId])

  const onClick = useCallback((node: NodeObject) => {
    const n = node as GraphNode
    // Clic = TOUJOURS ouvrir la note (façon Notion). Le zoom d'exploration reste à la molette / au cadrage.
    if (n.ref != null) onSelect(n.ref)
  }, [onSelect])

  const resetView = useCallback(() => fgRef.current?.zoomToFit(0, 110), [])

  useEffect(() => {
    if (data.nodes.length === 0 || size.w === 0) return
    const timers = [200, 900, 2800].map((ms) =>
      setTimeout(() => fgRef.current?.zoomToFit(0, 110), ms))
    return () => timers.forEach(clearTimeout)
  }, [data, size.w, size.h])

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-muted/20">
      {size.w > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={4}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointer}
          linkCanvasObject={drawLink}
          linkCanvasObjectMode={() => "replace"}
          enableNodeDrag={false}
          minZoom={0.15}
          maxZoom={8}
          cooldownTime={0}
          warmupTicks={0}
          d3VelocityDecay={0.9}
          onEngineStop={() => fgRef.current?.zoomToFit(0, 110)}
          onNodeClick={onClick}
          onNodeHover={(n) => setHoverId(n ? (n as GraphNode).id : null)}
        />
      )}

      <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/70 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
        Brain OS → workspace → projects → notes · zoom for detail · click opens
      </div>
      {data.legend.length > 0 && (
        <div className="pointer-events-none absolute right-2 bottom-2 flex max-h-[45%] flex-col gap-1 overflow-hidden rounded-md border bg-background/85 px-2.5 py-2 backdrop-blur">
          {data.legend.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[11px] leading-none">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-foreground">{r.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
        <span>The hierarchy is the map : each branch is a project, notes on the rim.</span>
        <span>● note · ◆ decision · <span style={{ color: FINDING_RED }}>▲ problem</span> · ⬡ runbook · ┄ wikilink</span>
      </div>
      <button onClick={resetView}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
        <Maximize2 className="size-3.5" /> Overview
      </button>
    </div>
  )
}
