"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d"
import { Maximize2 } from "lucide-react"
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/api/brain-service"

// ─── Couleur : teinte par branche (système), éclaircie avec la profondeur. ─────
const PROJECT_HUE = [210, 165, 38, 330, 262, 8, 142, 28, 190, 300]
function hsl(hue: number, s: number, l: number): string {
  return `hsl(${(((hue % 360) + 360) % 360).toFixed(0)}, ${s}%, ${l}%)`
}
const FINDING_RED = "#e0584d"
const ENTRANCE_MS = 600
const RADII = [0, 130, 255, 390, 525, 660, 790, 900] // rayon par niveau de profondeur
/** Rampe douce 0→1 entre deux niveaux de zoom (pour le fondu des labels). */
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

interface BrainGraphProps {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  selectedNodeId: number | null
  onSelect: (id: number) => void
  includeTags?: boolean
  onSelectTag?: (tag: string) => void
  activeTag?: string | null
}

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

  // ── Arbre radial déterministe : workspace → projets → systèmes → … → notes. ──
  const data = useMemo(() => {
    const byId = new Map<number, KnowledgeNode>()
    for (const n of nodes) if (!n.system) byId.set(n.id, n)
    const root = nodes.find((n) => n.title === "Brain OS" && !n.system) ?? null

    // enfants par parent (les orphelins se rattachent à la racine)
    const children = new Map<number, number[]>()
    const ensure = (id: number) => { let a = children.get(id); if (!a) { a = []; children.set(id, a) } return a }
    for (const n of byId.values()) {
      if (root && n.id === root.id) continue
      let pid = n.parentNodeId
      if (pid == null || !byId.has(pid)) pid = root ? root.id : -1
      ensure(pid).push(n.id)
    }
    // nombre de feuilles par sous-arbre (pondère la part angulaire)
    const leafMemo = new Map<number, number>()
    const leaves = (id: number): number => {
      const m = leafMemo.get(id); if (m != null) return m
      const ch = children.get(id)
      const v = !ch || ch.length === 0 ? 1 : ch.reduce((s, c) => s + leaves(c), 0)
      leafMemo.set(id, v); return v
    }

    const gNodes: GraphNode[] = []
    const sectors: { a0: number; a1: number; color: string; label: string }[] = []
    const proj = { c: 0 }
    const place = (id: number, a0: number, a1: number, depth: number, hue: number | undefined, idx: number) => {
      const node = byId.get(id)
      if (!node) return
      const ang = (a0 + a1) / 2
      const rad = RADII[Math.min(depth, RADII.length - 1)]
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad
      const ch = (children.get(id) ?? []).slice().sort((p, q) => p - q)
      const hasChildren = ch.length > 0
      const isProject = node.refType === "PROJECT" && depth === 1
      let myHue = hue
      if (isProject) myHue = PROJECT_HUE[proj.c++ % PROJECT_HUE.length]
      else if (depth === 2) myHue = (hue ?? 210) + (idx - 2) * 24
      const archived = node.status === "ARCHIVED" || node.domain === "ARCHIVE"
      const color = archived ? theme.muted
        : depth === 0 ? theme.fg
        : depth === 1 ? (isProject ? hsl(myHue!, 52, 50) : theme.muted)
        : hsl(myHue ?? 210, 58, Math.min(74, 52 + (depth - 2) * 7))
      if (isProject) sectors.push({ a0, a1, color: hsl(myHue!, 52, 50), label: node.title })
      gNodes.push({
        id: `n${node.id}`, ref: node.id, label: node.title, color, depth, hasChildren,
        ntype: node.type, archived, deg: 0, fx: x, fy: y, x, y,
      } as GraphNode)
      // Niveau 0 : les docs GLOBAUX forment un petit anneau autour du noyau (pas un quartier),
      // et seuls les PROJETS se partagent le cercle en parts de tarte.
      if (depth === 0) {
        const globals = ch.filter((c) => byId.get(c)?.refType !== "PROJECT")
        const projects = ch.filter((c) => byId.get(c)?.refType === "PROJECT")
        const gr = 82
        globals.forEach((c, i) => {
          const gn = byId.get(c); if (!gn) return
          const ga = (i / Math.max(1, globals.length)) * Math.PI * 2 - Math.PI / 2
          const gx = Math.cos(ga) * gr, gy = Math.sin(ga) * gr
          gNodes.push({ id: `n${gn.id}`, ref: gn.id, label: gn.title, color: theme.muted, depth: 1, hasChildren: false, ntype: gn.type, deg: 0, fx: gx, fy: gy, x: gx, y: gy } as GraphNode)
        })
        const ptot = projects.reduce((s, c) => s + leaves(c), 0) || 1
        let pacc = a0
        projects.forEach((c, ci) => {
          const w = (leaves(c) / ptot) * (a1 - a0)
          place(c, pacc, pacc + w, 1, myHue, ci)
          pacc += w
        })
        return
      }
      const total = ch.reduce((s, c) => s + leaves(c), 0) || 1
      let acc = a0
      ch.forEach((c, ci) => {
        const w = (leaves(c) / total) * (a1 - a0)
        place(c, acc, acc + w, depth + 1, myHue, ci)
        acc += w
      })
    }
    if (root) place(root.id, 0, Math.PI * 2, 0, undefined, 0)

    // Liens : structurels (le long des rayons) + transverses (wikilinks = chaos).
    const present = new Set(gNodes.map((n) => n.id))
    const gLinks: GraphLink[] = []
    const degree = new Map<string, number>()
    const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)
    for (const n of byId.values()) {
      if (root && n.id === root.id) continue
      let pid = n.parentNodeId
      if (pid == null || !byId.has(pid)) pid = root ? root.id : -1
      const s = `n${n.id}`, t = `n${pid}`
      if (present.has(s) && present.has(t)) { gLinks.push({ source: s, target: t, kind: "struct" }); bump(s); bump(t) }
    }
    for (const e of edges) {
      const s = `n${e.fromNodeId}`, t = `n${e.toNodeId}`
      if (!present.has(s) || !present.has(t) || s === t) continue
      gLinks.push({ source: s, target: t, kind: e.auto ? "auto" : "edge" }); bump(s); bump(t)
    }
    for (const gn of gNodes) gn.deg = degree.get(gn.id) ?? 0
    return { nodes: gNodes, links: gLinks, sectors }
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

    ctx.save()
    ctx.globalAlpha = (dim ? 0.12 : node.archived ? 0.55 : 1) * enter
    if (!dim && !node.archived) { ctx.shadowColor = node.color; ctx.shadowBlur = isFocus ? 16 : node.hasChildren ? 7 : 3 }
    tracePath(ctx, shape, x, y, r); ctx.fillStyle = node.color; ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = (isFocus ? 2.2 : 1) / scale
    ctx.strokeStyle = isFocus ? theme.primary : node.ntype === "FINDING" && !node.hasChildren ? FINDING_RED : theme.bg
    ctx.stroke()

    // Labels : taille écran fixe, fondu progressif piloté par le zoom (apparition par niveau).
    const isNeighbor = neighbors != null && neighbors.size <= 22 && neighbors.has(node.id)
    let labelA: number
    if (dim) labelA = 0
    else if (isFocus || isNeighbor) labelA = 1
    else if (node.depth === 0) labelA = 1
    else if (node.depth === 1) labelA = node.hasChildren ? 1 : fade(scale, 1.2, 1.7) // projets toujours ; globaux au zoom
    else if (node.depth === 2) labelA = fade(scale, 1.1, 1.7)   // systèmes
    else if (node.depth === 3) labelA = fade(scale, 1.9, 2.6)   // sous-systèmes
    else labelA = fade(scale, 3.0, 3.7)                          // feuilles
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
    if (hoverId) return s === hoverId || t === hoverId ? theme.primary : "rgba(140,140,150,0.025)"
    if (l.kind === "struct") return "rgba(150,150,165,0.15)"
    return "rgba(150,150,165,0.26)" // transverse = le "chaos"
  }, [hoverId, theme])

  // Rendu des arêtes façon dendrogramme radial : structurelles = courbes radiales
  // (s'évasent du parent vers l'enfant) ; transverses = bundlées vers le centre.
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
      ctx.quadraticCurveTo((s.x + t.x) * 0.16, (s.y + t.y) * 0.16, t.x, t.y) // contrôle tiré vers le centre
    }
    ctx.stroke()
    ctx.setLineDash([])
  }, [linkColor, hoverId])

  // Sous les nœuds : quartier coloré par projet + lignes de séparation (parts de tarte).
  const onFramePre = useCallback((ctx: CanvasRenderingContext2D) => {
    const R = RADII[RADII.length - 1] + 36
    ctx.save()
    for (const sc of data.sectors) {
      // éventail teinté
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, R, sc.a0, sc.a1)
      ctx.closePath()
      ctx.fillStyle = sc.color
      ctx.globalAlpha = 0.05
      ctx.fill()
      // lignes de séparation (bords du secteur)
      ctx.strokeStyle = theme.muted
      ctx.globalAlpha = 0.14
      ctx.lineWidth = 1
      for (const a of [sc.a0, sc.a1]) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke()
      }
    }
    // Cercle du noyau : démarque Brain OS + sa couronne de docs globaux.
    ctx.beginPath(); ctx.arc(0, 0, 116, 0, Math.PI * 2)
    ctx.fillStyle = theme.bg; ctx.globalAlpha = 0.7; ctx.fill()
    ctx.fillStyle = theme.muted; ctx.globalAlpha = 0.07; ctx.fill()
    ctx.strokeStyle = theme.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.restore()
  }, [data, theme])

  // Anneau de catégories sur le pourtour (1 arc coloré par projet), façon CERN/sports.
  const onFramePost = useCallback((ctx: CanvasRenderingContext2D) => {
    const R = RADII[RADII.length - 1] + 26
    ctx.save()
    ctx.lineCap = "butt"
    for (const sc of data.sectors) {
      ctx.beginPath()
      ctx.arc(0, 0, R, sc.a0 + 0.012, sc.a1 - 0.012)
      ctx.lineWidth = 16
      ctx.strokeStyle = sc.color
      ctx.globalAlpha = 0.5
      ctx.stroke()
    }
    ctx.restore()
  }, [data])

  const onClick = useCallback((node: NodeObject) => {
    const n = node as GraphNode
    const fg = fgRef.current
    if (n.hasChildren && fg && n.x != null && n.y != null) { fg.centerAt(n.x, n.y, 600); fg.zoom(Math.min(4, 1.6 + n.depth * 0.7), 600) }
    else if (n.ref != null) onSelect(n.ref)
  }, [onSelect])

  const resetView = useCallback(() => fgRef.current?.zoomToFit(600, 80), [])

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
          onRenderFramePre={onFramePre}
          onRenderFramePost={onFramePost}
          enableNodeDrag={false}
          minZoom={0.2}
          maxZoom={7}
          cooldownTime={2500}
          warmupTicks={0}
          d3VelocityDecay={0.6}
          onEngineStop={() => fgRef.current?.zoomToFit(600, 80)}
          onNodeClick={onClick}
          onNodeHover={(n) => setHoverId(n ? (n as GraphNode).id : null)}
        />
      )}

      <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/70 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
        Arbre cosmique · survol = révèle les liens · clic = plonger dans un système
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
        <span>Anneaux = profondeur · couleur = branche (système) · — hiérarchie · ┄ transverse (wikilink)</span>
        <span>● système · ◆ décision · <span style={{ color: FINDING_RED }}>▲ problème</span> · ⬡ runbook</span>
      </div>
      <button onClick={resetView}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
        <Maximize2 className="size-3.5" /> Vue globale
      </button>
    </div>
  )
}
