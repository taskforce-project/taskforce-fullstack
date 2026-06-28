"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/api/brain-service"

// ─── Couleurs par domaine (déterministe via le code numérique) ────────────────

function domainColor(domainCode: string): string {
  const n = parseInt(domainCode, 10) || 0
  const hue = (n * 47) % 360 // dispersion des teintes
  return `hsl(${hue}, 65%, 55%)`
}

// ─── Modèle interne de simulation ─────────────────────────────────────────────

interface Sim {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null // position fixée (drag)
  fy: number | null
}

interface Transform {
  x: number
  y: number
  k: number
}

interface BrainGraphProps {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  selectedNodeId: number | null
  onSelect: (id: number) => void
}

export function BrainGraph({ nodes, edges, selectedNodeId, onSelect }: BrainGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Map<number, Sim>>(new Map())
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const sizeRef = useRef({ w: 800, h: 600 })
  const alphaRef = useRef(1)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<{ id: number; moved: boolean } | null>(null)
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 })

  const [positions, setPositions] = useState<Map<number, Sim>>(new Map())
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [panning, setPanning] = useState(false)

  // Synchronise les refs (lues dans la boucle rAF / handlers) hors rendu.
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])
  useEffect(() => { transformRef.current = transform }, [transform])

  // Initialise / réconcilie les positions quand l'ensemble de nodes change.
  useEffect(() => {
    const sim = simRef.current
    const { w, h } = sizeRef.current
    const existing = new Set<number>()
    nodes.forEach((n, i) => {
      existing.add(n.id)
      if (!sim.has(n.id)) {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
        const r = 120 + (i % 5) * 30
        sim.set(n.id, {
          id: n.id,
          x: w / 2 + Math.cos(angle) * r,
          y: h / 2 + Math.sin(angle) * r,
          vx: 0, vy: 0, fx: null, fy: null,
        })
      }
    })
    for (const id of Array.from(sim.keys())) if (!existing.has(id)) sim.delete(id)
    alphaRef.current = 1 // réchauffe la simulation
    setPositions(new Map(sim))
  }, [nodes])

  // Boucle de simulation de forces (repulsion + ressorts + centrage).
  useEffect(() => {
    const tick = () => {
      const sim = simRef.current
      const arr = Array.from(sim.values())
      const { w, h } = sizeRef.current
      const alpha = alphaRef.current

      if (arr.length > 0 && alpha > 0.005) {
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i], b = arr[j]
            let dx = a.x - b.x, dy = a.y - b.y
            let dist2 = dx * dx + dy * dy
            if (dist2 < 0.01) { dx = Math.random(); dy = Math.random(); dist2 = 1 }
            const dist = Math.sqrt(dist2)
            const force = (4000 * alpha) / dist2
            const fx = (dx / dist) * force, fy = (dy / dist) * force
            a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
          }
        }
        const ideal = 90
        for (const e of edgesRef.current) {
          const a = sim.get(e.fromNodeId), b = sim.get(e.toNodeId)
          if (!a || !b) continue
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = ((dist - ideal) / dist) * 0.08 * alpha
          const fx = dx * force, fy = dy * force
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
        }
        const cx = w / 2, cy = h / 2
        for (const n of arr) {
          n.vx += (cx - n.x) * 0.002 * alpha
          n.vy += (cy - n.y) * 0.002 * alpha
          if (n.fx !== null && n.fy !== null) {
            n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0
          } else {
            n.vx *= 0.85; n.vy *= 0.85
            n.x += n.vx; n.y += n.vy
          }
        }
        alphaRef.current = alpha * 0.99
        setPositions(new Map(sim))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // Suivi de la taille du conteneur.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
    })
    ro.observe(el)
    sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
    return () => ro.disconnect()
  }, [])

  // Conversion écran → coordonnées graphe.
  const toGraph = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const t = transformRef.current
    const sx = clientX - (rect?.left ?? 0)
    const sy = clientY - (rect?.top ?? 0)
    return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k }
  }, [])

  // ── Interactions ───────────────────────────────────────────────────────────

  const onNodePointerDown = (e: React.PointerEvent, id: number) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { id, moved: false }
    const n = simRef.current.get(id)
    if (n) { n.fx = n.x; n.fy = n.y }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const n = simRef.current.get(dragRef.current.id)
      if (n) {
        const g = toGraph(e.clientX, e.clientY)
        n.fx = g.x; n.fy = g.y
        dragRef.current.moved = true
        alphaRef.current = Math.max(alphaRef.current, 0.3)
      }
    } else if (panRef.current) {
      const p = panRef.current
      setTransform((t) => ({ ...t, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) }))
    }
  }

  const onPointerUp = () => {
    if (dragRef.current) {
      const d = dragRef.current
      const n = simRef.current.get(d.id)
      if (n) { n.fx = null; n.fy = null }
      if (!d.moved) onSelect(d.id) // clic simple = sélection
      alphaRef.current = Math.max(alphaRef.current, 0.2)
    }
    dragRef.current = null
    panRef.current = null
    setPanning(false)
  }

  const onBgPointerDown = (e: React.PointerEvent) => {
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: transformRef.current.x, oy: transformRef.current.y }
    setPanning(true)
  }

  const onWheel = (e: React.WheelEvent) => {
    const t = transformRef.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const k = Math.max(0.25, Math.min(3, t.k * factor))
    const rect = containerRef.current?.getBoundingClientRect()
    const mx = e.clientX - (rect?.left ?? 0)
    const my = e.clientY - (rect?.top ?? 0)
    setTransform({ k, x: mx - ((mx - t.x) / t.k) * k, y: my - ((my - t.y) / t.k) * k })
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-muted/20"
      onWheel={onWheel}
    >
      <svg
        className="h-full w-full touch-none"
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: panning ? "grabbing" : "grab" }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Arêtes */}
          {edges.map((e) => {
            const a = positions.get(e.fromNodeId), b = positions.get(e.toNodeId)
            if (!a || !b) return null
            const active = selectedNodeId === e.fromNodeId || selectedNodeId === e.toNodeId
            return (
              <line
                key={e.id}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={active ? "hsl(var(--primary))" : "currentColor"}
                strokeOpacity={active ? 0.7 : 0.18}
                strokeWidth={active ? 2 : 1}
                className="text-muted-foreground"
              />
            )
          })}
          {/* Nodes */}
          {nodes.map((node) => {
            const p = positions.get(node.id)
            if (!p) return null
            const selected = selectedNodeId === node.id
            const hovered = hoverId === node.id
            const r = selected ? 9 : 6
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                style={{ cursor: "pointer" }}
                onPointerDown={(ev) => onNodePointerDown(ev, node.id)}
                onPointerEnter={() => setHoverId(node.id)}
                onPointerLeave={() => setHoverId((h) => (h === node.id ? null : h))}
              >
                <circle
                  r={r}
                  fill={domainColor(node.domainCode)}
                  stroke={selected ? "hsl(var(--primary))" : "white"}
                  strokeWidth={selected ? 3 : 1.5}
                />
                {(selected || hovered || nodes.length <= 30) && (
                  <text
                    x={r + 4}
                    y={4}
                    fontSize={11}
                    className="fill-foreground"
                    style={{ pointerEvents: "none", fontWeight: selected ? 600 : 400 }}
                  >
                    {node.title.length > 28 ? node.title.slice(0, 27) + "…" : node.title}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-muted-foreground">
        Glisser un node · molette = zoom · fond = déplacer
      </div>
      <button
        onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
        className="absolute right-2 top-2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Recentrer
      </button>
    </div>
  )
}
