"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d"
import { Maximize2 } from "lucide-react"
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/api/brain-service"

// ─── Couleur : une teinte par projet (région). ─────────────────────────────────
const PROJECT_HUE = [210, 165, 38, 330, 262, 8, 142, 28, 190, 300]
function hsl(hue: number, s: number, l: number): string {
  return `hsl(${(((hue % 360) + 360) % 360).toFixed(0)}, ${s}%, ${l}%)`
}
const FINDING_RED = "#e0584d"
const ENTRANCE_MS = 600

/**
 * Géométrie des régions. Le placement est **déterministe** (aucune simulation) : mêmes données =
 * même dessin, pas de gigue au re-render. C'est le parti pris d'origine du composant, conservé.
 */
const PACK = 30      // espacement des nœuds au sein d'une cellule (tassement phyllotaxique)
const CELL_GAP = 24  // jeu entre le noyau et une cellule projet, et entre cellules voisines
const BLOB_R = 46    // rayon du disque posé sur chaque nœud ; leur union dessine la cellule

/** Projets d'une note. **Liste** : une connaissance est souvent transverse (cf. metadata.projects). */
function projectsOf(node: KnowledgeNode): number[] {
  const raw = (node.metadata as { projects?: unknown } | null | undefined)?.projects
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is number => typeof v === "number")
}

interface Pt { x: number; y: number }

/** Un secteur de camembert **à l'intérieur** d'une cellule : un domaine. */
interface Wedge { label: string; a0: number; a1: number }
/** Une cellule (la base, ou un projet) et son découpage interne par domaine. */
interface CellLayout { key: string; at: Pt; radius: number; wedges: Wedge[] }

const CONTOUR_RAYS = 144   // finesse du contour (marche radiale)
const MARCH_STEP = 5       // pas de la marche, en unités de graphe
const PRESSURE = 0.62      // poids de la poussée exercée par les nœuds des AUTRES cellules

/**
 * Calcule le contour d'une cellule comme une **isoligne de champ scalaire** (metaball) - c'est ce
 * qui donne le vrai rendu fluide, plutôt que des ronds collés.
 *
 * <p>Le champ vaut la somme des influences des nœuds de la cellule **moins** celle des nœuds des
 * autres cellules. Conséquence : là où deux cellules se touchent, chacune **repousse** l'autre et
 * les deux frontières s'aplatissent l'une contre l'autre, comme deux bulles de savon. La ligne n'est
 * donc pas dessinée « autour de » ses nœuds, elle est **négociée avec les voisines**.
 *
 * <p>Et là où une note appartient aux deux cellules, elle nourrit les **deux** champs (elle n'est
 * dans les « autres » de personne) : les contours se recouvrent en lentille. L'intersection est
 * l'information - c'est tout l'intérêt sur un camembert exclusif.
 *
 * <p>Marche radiale depuis le barycentre plutôt qu'un marching squares : même résultat sur des
 * cellules compactes, une fraction du coût, et un contour trivialement ordonné (donc lissable). Le
 * calcul est fait **une fois par layout**, pas par image.
 */
function metaballContour(own: Pt[], others: Pt[], radius: number): Pt[] {
  if (own.length === 0) return []
  const cx = own.reduce((s, p) => s + p.x, 0) / own.length
  const cy = own.reduce((s, p) => s + p.y, 0) / own.length
  const r2 = radius * radius

  const field = (x: number, y: number): number => {
    let v = 0
    for (const p of own) {
      const dx = x - p.x, dy = y - p.y
      v += r2 / Math.max(dx * dx + dy * dy, 25)
    }
    for (const p of others) {
      const dx = x - p.x, dy = y - p.y
      v -= (PRESSURE * r2) / Math.max(dx * dx + dy * dy, 25)
    }
    return v
  }

  const spread = own.reduce((m, p) => Math.max(m, Math.hypot(p.x - cx, p.y - cy)), 0)
  const far = spread + radius * 3.5   // portée sondée : au-delà, le champ a forcément décru
  const bound = spread + radius       // borne dure d'un rayon (cf. plus bas)

  const circle = (r: number) =>
    Array.from({ length: CONTOUR_RAYS }, (_, i) => {
      const a = (i / CONTOUR_RAYS) * Math.PI * 2
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
    })

  // Cellule écrasée par la pression des voisines : il n'y a plus d'isoligne à tracer. On rend un
  // disque minimal plutôt qu'un contour aberrant - mieux vaut une forme fausse mais lisible.
  const center = field(cx, cy)
  if (center <= 1) return circle(radius * 0.55)

  const ring: Pt[] = []
  for (let i = 0; i < CONTOUR_RAYS; i++) {
    const a = (i / CONTOUR_RAYS) * Math.PI * 2
    const dx = Math.cos(a), dy = Math.sin(a)
    let hit: number | null = null
    let prev = center
    for (let d = MARCH_STEP; d <= far; d += MARCH_STEP) {
      const v = field(cx + dx * d, cy + dy * d)
      if (v < 1) {
        // Interpolation du passage sous le seuil → contour lisse, pas en escalier. Bornée à [0,1] :
        // le champ n'est pas monotone (les voisines le creusent), une extrapolation renverrait un
        // rayon négatif et le contour se retournerait.
        const t = Math.min(1, Math.max(0, (prev - 1) / Math.max(prev - v, 1e-6)))
        hit = d - MARCH_STEP + t * MARCH_STEP
        break
      }
      prev = v
    }
    // Aucun croisement trouvé : on borne. Sans ce garde-fou le rayon file jusqu'à `far`, le contour
    // se déchire en éventail et le remplissage (règle non-nulle) barbouille la moitié du graphe.
    ring.push({ x: cx + dx * (hit ?? bound), y: cy + dy * (hit ?? bound) })
  }
  return ring
}

/** Trace un contour déjà calculé, adouci par quadratiques passant par les milieux. */
function traceContour(ctx: CanvasRenderingContext2D, ring: Pt[]) {
  if (ring.length < 3) return
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  ctx.beginPath()
  const start = mid(ring[ring.length - 1], ring[0])
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i], next = ring[(i + 1) % ring.length]
    const m = mid(cur, next)
    ctx.quadraticCurveTo(cur.x, cur.y, m.x, m.y)
  }
  ctx.closePath()
}

/** Tassement en spirale phyllotaxique : dense, régulier, et déterministe pour un index donné. */
function packOffset(i: number): Pt {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const r = PACK * Math.sqrt(i)
  return { x: Math.cos(i * golden) * r, y: Math.sin(i * golden) * r }
}

/** `PCA_PRA` → `PCA / PRA`, `SECURITE` → `Sécurité`. Les libellés viennent de l'enum de domaine. */
const DOMAIN_LABEL: Record<string, string> = {
  PROJET: "Project", PRODUIT: "Product", ARCHITECTURE: "Architecture", ENGINEERING: "Engineering",
  API: "API", INFRA: "Infrastructure", SECURITE: "Security", OPERATIONS: "Operations",
  AUDITS: "Audits", RUNBOOKS: "Runbooks", PCA_PRA: "BCP / DRP", DECISIONS: "Decisions",
  ROADMAP: "Roadmap", DESIGN: "Design", UTILISATEUR: "User", HISTORIQUE: "History",
  ARCHIVE: "Archive",
}
const domainLabel = (d: string) => DOMAIN_LABEL[d] ?? d
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
  /** Projets du workspace - sert à nommer les régions. Sans eux, tout est « global ». */
  projects?: GraphProject[]
  includeTags?: boolean
  onSelectTag?: (tag: string) => void
  activeTag?: string | null
}

export function BrainGraph({
  nodes, edges, selectedNodeId, onSelect, projects = [],
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

  // ── Régions par projet. Placement déterministe : mêmes données = même dessin. ──
  const data = useMemo(() => {
    const byId = new Map<number, KnowledgeNode>()
    for (const n of nodes) if (!n.system) byId.set(n.id, n)
    const root = nodes.find((n) => n.title === "Brain OS" && !n.system) ?? null

    // Régions = projets réellement portés par au moins une note (tri = ordre stable des teintes).
    const known = new Map(projects.map((p) => [p.id, p]))
    const regionIds = [...new Set([...byId.values()].flatMap(projectsOf))]
      .filter((id) => known.has(id))
      .sort((a, b) => a - b)
    const hueOf = new Map<number, number>()
    regionIds.forEach((pid, i) => hueOf.set(pid, PROJECT_HUE[i % PROJECT_HUE.length]))

    // Un nœud est rangé avec ceux qui partagent EXACTEMENT ses projets : les transverses forment
    // donc leur propre amas, posé entre les cellules concernées.
    const memberships = new Map<number, number[]>()
    const clusters = new Map<string, number[]>()
    for (const n of byId.values()) {
      if (root && n.id === root.id) continue
      const ps = projectsOf(n).filter((p) => known.has(p)).sort((a, b) => a - b)
      memberships.set(n.id, ps)
      const key = ps.length > 0 ? ps.join("-") : "global"
      const arr = clusters.get(key)
      if (arr) arr.push(n.id); else clusters.set(key, [n.id])
    }

    const ownCount = (key: string) => clusters.get(key)?.length ?? 0
    const cellRadius = (n: number) => (n <= 1 ? 24 : PACK * Math.sqrt(n - 1) + 24)

    const cellAt = new Map<string, Pt>()

    /**
     * **Le noyau au centre.** Brain OS + la connaissance hors projet = la base native sur laquelle
     * tout se construit ; les projets viennent s'y **coller**, ils n'orbitent pas au loin.
     */
    const coreR = cellRadius(ownCount("global") + (root ? 1 : 0))
    cellAt.set("global", { x: 0, y: 0 })

    /**
     * Cellules projet : en couronne **collée** au noyau, packées par leur **largeur angulaire** -
     * surtout pas réparties sur 360°. Deux fois de suite ça a été l'erreur : réparties, deux projets
     * se retrouvent dos à dos et leur note commune finit à l'opposé des deux → enveloppes en bâtons.
     * Packées, elles sont voisines : la note commune tombe **au milieu du segment** qui les sépare,
     * et les deux cellules se recouvrent en lentille. Si elles ne font pas le tour, on ne les écarte
     * pas : on groupe l'arc et on le centre.
     */
    const arc = regionIds.map((pid) => {
      const r = cellRadius(ownCount(String(pid)))
      const ring = coreR + r + CELL_GAP
      return { pid, r, ring, half: Math.asin(Math.min(1, (r + CELL_GAP) / ring)) }
    })
    const spread = arc.reduce((s, c) => s + 2 * c.half, 0)
    const squeeze = spread > Math.PI * 2 ? (Math.PI * 2) / spread : 1
    let cursor = -Math.PI / 2 - (spread * squeeze) / 2
    for (const c of arc) {
      const step = 2 * c.half * squeeze
      const a = cursor + step / 2
      cellAt.set(String(c.pid), { x: Math.cos(a) * c.ring, y: Math.sin(a) * c.ring })
      cursor += step
    }

    /** Ancre d'un amas transverse : le **milieu** des cellules concernées, donc sur leur frontière. */
    const anchorFor = (ps: number[]): Pt => {
      const cs = ps.map((p) => cellAt.get(String(p))).filter((c): c is Pt => !!c)
      if (cs.length === 0) return { x: 0, y: 0 }
      return {
        x: cs.reduce((s, c) => s + c.x, 0) / cs.length,
        y: cs.reduce((s, c) => s + c.y, 0) / cs.length,
      }
    }

    const childCount = new Map<number, number>()
    for (const n of byId.values()) {
      if (n.parentNodeId != null && byId.has(n.parentNodeId)) {
        childCount.set(n.parentNodeId, (childCount.get(n.parentNodeId) ?? 0) + 1)
      }
    }

    const gNodes: GraphNode[] = []
    const pos = new Map<number, Pt>()
    const push = (id: number, at: Pt, depth: number, color: string) => {
      const node = byId.get(id)
      if (!node) return
      const archived = node.status === "ARCHIVED" || node.domain === "ARCHIVE"
      gNodes.push({
        id: `n${node.id}`, ref: node.id, label: node.title,
        color: archived ? theme.muted : color,
        depth, hasChildren: (childCount.get(node.id) ?? 0) > 0,
        ntype: node.type, archived, deg: 0, fx: at.x, fy: at.y, x: at.x, y: at.y,
      } as GraphNode)
      pos.set(node.id, at)
    }

    const sortNodes = (ids: number[]) => ids.slice().sort((a, b) => {
      const na = byId.get(a), nb = byId.get(b)
      if (!na || !nb) return a - b
      return na.domain.localeCompare(nb.domain) || na.title.localeCompare(nb.title)
    })

    /**
     * **Camembert par domaine à l'intérieur d'une cellule.** Chaque domaine (Projet, Produit,
     * Architecture, Sécurité…) prend un secteur proportionnel à son nombre de notes, et ses notes s'y
     * rangent. Sans ce second niveau, une cellule dit « ces notes sont au projet WEB » mais pas « voici
     * la partie archi de WEB » - or c'est ça qu'on cherche à lire.
     */
    const cells: CellLayout[] = []
    const layOutCell = (key: string, at: Pt, ids: number[], radius: number, depth: number, color: string) => {
      const byDomain = new Map<string, number[]>()
      for (const id of ids) {
        const d = byId.get(id)?.domain ?? "OTHER"
        const arr = byDomain.get(d)
        if (arr) arr.push(id); else byDomain.set(d, [id])
      }
      // Ordre par code de domaine (01 · Projet, 02 · Produit…) → secteurs stables d'un rendu à l'autre.
      const domains = [...byDomain.keys()].sort((a, b) => {
        const ca = byId.get(byDomain.get(a)![0])?.domainCode ?? a
        const cb = byId.get(byDomain.get(b)![0])?.domainCode ?? b
        return ca.localeCompare(cb)
      })
      const total = ids.length || 1
      const wedges: Wedge[] = []
      let acc = -Math.PI / 2
      for (const d of domains) {
        const list = sortNodes(byDomain.get(d) ?? [])
        const span = (list.length / total) * Math.PI * 2
        wedges.push({ label: domainLabel(d), a0: acc, a1: acc + span })
        list.forEach((id, i) => {
          const t = (i + 0.5) / list.length
          const a = acc + span * t
          // Une seule note → posée à mi-rayon ; plusieurs → étalées du cœur vers le bord du secteur.
          const r = radius * (list.length === 1 ? 0.6 : 0.4 + 0.45 * Math.sqrt(t))
          push(id, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, depth, color)
        })
        acc += span
      }
      cells.push({ key, at, radius, wedges })
    }

    for (const [key, ids] of clusters) {
      const sorted = sortNodes(ids)
      if (key === "global") {
        // La base : le noyau « Brain OS » en plein cœur, la doctrine répartie par domaine autour.
        const at = cellAt.get("global") ?? { x: 0, y: 0 }
        if (root) push(root.id, at, 0, theme.fg)
        layOutCell("global", at, sorted, coreR, 1, theme.muted)
        continue
      }
      const ps = key.split("-").map(Number)
      if (ps.length > 1) {
        // Amas transverse : il n'habite aucune cellule, il se pose entre elles - pas de camembert.
        const anchor = anchorFor(ps)
        const color = theme.fg // neutre : la note n'appartient en propre à aucune couleur
        sorted.forEach((id, i) => {
          const o = packOffset(i)
          push(id, { x: anchor.x + o.x, y: anchor.y + o.y }, 2, color)
        })
        continue
      }
      const at = cellAt.get(key) ?? { x: 0, y: 0 }
      layOutCell(key, at, sorted, cellRadius(sorted.length), 2, hsl(hueOf.get(ps[0]) ?? 210, 58, 55))
    }
    // Filet : si le noyau n'appartenait à aucun amas (workspace sans note hors projet), on le pose au centre.
    if (root && !pos.has(root.id)) push(root.id, { x: 0, y: 0 }, 0, theme.fg)

    // Points par cellule. Une note transverse compte dans CHAQUE cellule dont elle relève : c'est ce
    // qui fait que deux cellules se recouvrent au lieu de se découper. Le hors-projet (clé -1) est
    // une cellule lui aussi - sans elle, la base flotterait sans frontière.
    const ptsOf = new Map<number, Pt[]>()
    const globalPts: Pt[] = []
    if (root) { const p = pos.get(root.id); if (p) globalPts.push(p) }
    for (const [nodeId, ps] of memberships) {
      const p = pos.get(nodeId)
      if (!p) continue
      if (ps.length === 0) { globalPts.push(p); continue }
      for (const pid of ps) {
        const arr = ptsOf.get(pid)
        if (arr) arr.push(p); else ptsOf.set(pid, [p])
      }
    }
    if (globalPts.length > 0) ptsOf.set(-1, globalPts)

    const regionKeys = [...(globalPts.length > 0 ? [-1] : []), ...regionIds]
      .filter((k) => (ptsOf.get(k)?.length ?? 0) > 0)

    const regions = regionKeys.map((key) => {
      const own = ptsOf.get(key) ?? []
      // Les nœuds des AUTRES cellules : ce sont eux qui repoussent le contour. Une note transverse
      // appartient aux deux → elle n'est dans les « autres » de personne, donc les deux contours
      // bombent vers elle et se recouvrent.
      const others: Pt[] = []
      for (const [k, list] of ptsOf) {
        if (k === key) continue
        for (const p of list) if (!own.includes(p)) others.push(p)
      }
      const project = key === -1 ? null : known.get(key)
      return {
        id: key,
        name: key === -1 ? "Common base" : (project?.name ?? String(key)),
        hue: key === -1 ? 0 : (hueOf.get(key) ?? 210),
        muted: key === -1,
        count: own.length,
        pts: own,
        path: metaballContour(own, others, BLOB_R),
      }
    })

    // Liens : hiérarchie réelle (parentNodeId) + transverses (wikilinks). Aucun lien inventé vers
    // le noyau : le hub tient au graphe par ses propres [[wikilinks]], comme n'importe quelle note.
    const present = new Set(gNodes.map((n) => n.id))
    const gLinks: GraphLink[] = []
    const degree = new Map<string, number>()
    const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)
    for (const n of byId.values()) {
      if (n.parentNodeId == null || !byId.has(n.parentNodeId)) continue
      const s = `n${n.id}`, t = `n${n.parentNodeId}`
      if (present.has(s) && present.has(t)) { gLinks.push({ source: s, target: t, kind: "struct" }); bump(s); bump(t) }
    }
    for (const e of edges) {
      const s = `n${e.fromNodeId}`, t = `n${e.toNodeId}`
      if (!present.has(s) || !present.has(t) || s === t) continue
      gLinks.push({ source: s, target: t, kind: e.auto ? "auto" : "edge" }); bump(s); bump(t)
    }
    for (const gn of gNodes) gn.deg = degree.get(gn.id) ?? 0
    return { nodes: gNodes, links: gLinks, regions, cells }
  }, [nodes, edges, projects, theme])

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

  /**
   * Sous les nœuds : une région par projet, dessinée comme l'enveloppe de ses notes.
   *
   * <p>Les régions se **chevauchent** là où une note relève de plusieurs projets - c'est voulu, et
   * c'est précisément ce qu'une part de tarte ne sait pas dire : une connaissance transverse
   * n'appartient pas à un seul quartier. L'intersection *est* l'information.
   */
  const onFramePre = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save()
    for (const region of data.regions) {
      traceContour(ctx, region.path)
      ctx.fillStyle = region.muted ? theme.muted : hsl(region.hue, 62, 52)
      // Alpha faible : là où deux cellules se recouvrent, les teintes s'additionnent et
      // l'intersection ressort d'elle-même. C'est l'info, pas un artefact.
      ctx.globalAlpha = region.muted ? 0.05 : 0.11
      ctx.fill()
      ctx.strokeStyle = region.muted ? theme.muted : hsl(region.hue, 52, 48)
      ctx.globalAlpha = region.muted ? 0.22 : 0.4
      ctx.lineWidth = 1.4
      ctx.stroke()
    }

    // Second niveau : le camembert par domaine, découpé DANS la forme organique de la cellule
    // (`clip`) - les traits épousent donc le contour au lieu d'en déborder.
    for (const cell of data.cells) {
      if (cell.wedges.length < 2) continue
      const region = data.regions.find((r) => r.id === (cell.key === "global" ? -1 : Number(cell.key)))
      if (!region) continue
      ctx.save()
      traceContour(ctx, region.path)
      ctx.clip()
      ctx.strokeStyle = region.muted ? theme.muted : hsl(region.hue, 45, 45)
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 1
      const reach = cell.radius + BLOB_R * 2
      for (const w of cell.wedges) {
        ctx.beginPath()
        ctx.moveTo(cell.at.x, cell.at.y)
        ctx.lineTo(cell.at.x + Math.cos(w.a0) * reach, cell.at.y + Math.sin(w.a0) * reach)
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.restore()
  }, [data, theme])

  /**
   * Au-dessus des nœuds : le nom de chaque cellule, posé **vers l'extérieur du graphe** - la base au
   * sud (les projets lui sont collés au nord), chaque projet à l'opposé du noyau. Le poser au sommet
   * de l'enveloppe, comme au premier jet, l'enfouissait sous les cellules voisines.
   */
  const onFramePost = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
    ctx.save()
    for (const region of data.regions) {
      const cx = region.pts.reduce((s, p) => s + p.x, 0) / region.pts.length
      const cy = region.pts.reduce((s, p) => s + p.y, 0) / region.pts.length
      const d = Math.hypot(cx, cy)
      const dir = d < 1 ? { x: 0, y: 1 } : { x: cx / d, y: cy / d } // la base est au centre → sud
      const reach = Math.max(...region.pts.map((p) => (p.x - cx) * dir.x + (p.y - cy) * dir.y))
      const lx = cx + dir.x * (reach + BLOB_R + 16)
      const ly = cy + dir.y * (reach + BLOB_R + 16)

      ctx.font = `600 ${Math.max(2, 12 / scale)}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round"
      ctx.lineWidth = 3.2 / scale; ctx.strokeStyle = theme.bg; ctx.globalAlpha = 0.9
      ctx.strokeText(region.name, lx, ly)
      ctx.fillStyle = region.muted ? theme.muted : hsl(region.hue, 48, 42); ctx.globalAlpha = 1
      ctx.fillText(region.name, lx, ly)
    }

    // Nom des domaines dans leur secteur - au zoom seulement : à l'échelle « vue globale » ça
    // empilerait 17 libellés dans la base et ne dirait plus rien.
    const wa = fade(scale, 1.0, 1.6)
    if (wa > 0.03) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.font = `500 ${Math.max(1.5, 9 / scale)}px ui-sans-serif, system-ui, sans-serif`
      for (const cell of data.cells) {
        if (cell.wedges.length < 2) continue
        for (const w of cell.wedges) {
          const a = (w.a0 + w.a1) / 2
          const lx = cell.at.x + Math.cos(a) * cell.radius * 0.99
          const ly = cell.at.y + Math.sin(a) * cell.radius * 0.99
          ctx.lineWidth = 2.6 / scale; ctx.strokeStyle = theme.bg; ctx.globalAlpha = wa * 0.9
          ctx.strokeText(w.label, lx, ly)
          ctx.fillStyle = theme.muted; ctx.globalAlpha = wa
          ctx.fillText(w.label, lx, ly)
        }
      }
    }
    ctx.restore()
  }, [data, theme])

  const onClick = useCallback((node: NodeObject) => {
    const n = node as GraphNode
    const fg = fgRef.current
    if (n.hasChildren && fg && n.x != null && n.y != null) { fg.centerAt(n.x, n.y, 600); fg.zoom(Math.min(4, 1.6 + n.depth * 0.7), 600) }
    else if (n.ref != null) onSelect(n.ref)
  }, [onSelect])

  // Durée 0 (une transition ne s'applique pas, cf. plus bas) et marge large : `zoomToFit` ne cadre
  // que sur les **nœuds**, or les libellés de cellule débordent de l'enveloppe et seraient rognés.
  const resetView = useCallback(() => fgRef.current?.zoomToFit(0, 110), [])

  /**
   * Recadre à chaque changement de layout. Il faut les deux dépendances :
   *  - les **projets** arrivent du store APRÈS le premier rendu : les nœuds quittent alors la
   *    couronne centrale pour les régions, mais leurs positions étant fixes le moteur ne redémarre
   *    pas et `onEngineStop` ne se rejoue jamais → la vue resterait cadrée sur l'image d'avant ;
   *  - la **taille** conditionne le montage de `ForceGraph2D` (`size.w > 0`).
   *
   * ⚠️ **Durée 0, pas une transition.** `zoomToFit(400, …)` anime le zoom via d3 - et l'animation se
   * fait écraser avant d'aboutir (les ticks du moteur reprennent la main), sans la moindre erreur :
   * la vue ne bouge pas d'un pixel. Diagnostiqué en live : `getGraphBbox()` renvoyait déjà le bon
   * cadre, et le même appel rejoué à la console avec une durée **0** cadrait parfaitement. On
   * applique donc le cadrage d'un coup, et on le retente le temps que le canvas se stabilise.
   */
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
          onRenderFramePre={onFramePre}
          onRenderFramePost={onFramePost}
          enableNodeDrag={false}
          minZoom={0.2}
          maxZoom={7}
          cooldownTime={2500}
          warmupTicks={0}
          d3VelocityDecay={0.6}
          // Durée 0 comme partout ailleurs : une transition se fait écraser en silence, et celle-ci
          // arrivait par-dessus le cadrage de l'effet ci-dessus.
          onEngineStop={() => fgRef.current?.zoomToFit(0, 110)}
          onNodeClick={onClick}
          onNodeHover={(n) => setHoverId(n ? (n as GraphNode).id : null)}
        />
      )}

      <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/70 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
        Regions = projects · hover = reveal links · click = open note
      </div>
      {/* Code couleur : une pastille par cellule. Sans ça on lit des formes colorées sans savoir qui est qui. */}
      {data.regions.length > 0 && (
        <div className="pointer-events-none absolute right-2 bottom-2 flex flex-col gap-1 rounded-md border bg-background/85 px-2.5 py-2 backdrop-blur">
          {data.regions.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[11px] leading-none">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: r.muted ? theme.muted : hsl(r.hue, 62, 52) }}
              />
              <span className={r.muted ? "text-muted-foreground" : "text-foreground"}>{r.name}</span>
              <span className="ml-auto pl-2 tabular-nums text-muted-foreground/70">{r.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
        <span>One cell per project, split by domain · borders <strong className="font-medium">push apart</strong>, a note in 2 projects makes them <strong className="font-medium">overlap</strong></span>
        <span>● note · ◆ decision · <span style={{ color: FINDING_RED }}>▲ problem</span> · ⬡ runbook · ┄ wikilink</span>
      </div>
      <button onClick={resetView}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
        <Maximize2 className="size-3.5" /> Overview
      </button>
    </div>
  )
}
