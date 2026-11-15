"use client"

import { useEffect, useState, type RefObject } from "react"

import type { DependencyEdge } from "@/lib/workflow/view"

/**
 * Les dépendances du nœud choisi (séance n°25, §4.8), sur un calque SVG au-dessus des colonnes : des courbes de 2 px en
 * `--primary` et une pointe de 6 px, de ce qui bloque vers ce qui est bloqué ; au survol d'une arête, « Blocks » ou
 * « Blocked by ». Seulement pour la sélection, cinquante arêtes au plus : jamais la pelote. Une arête dont une carte n'est
 * pas à l'écran (repliée, hors de la fenêtre de sa colonne) ne se dessine pas ; l'inspecteur la liste.
 */

export interface DrawnEdge {
  readonly key: string
  readonly d: string
  readonly side: DependencyEdge["side"]
}

/** La courbe d'une arête, d'un rectangle à l'autre (coordonnées du calque) : de côté à côté, ou par la gauche dans une colonne. */
export function edgePath(
  from: { left: number; right: number; top: number; bottom: number },
  to: { left: number; right: number; top: number; bottom: number },
): string {
  const fy = (from.top + from.bottom) / 2
  const ty = (to.top + to.bottom) / 2
  if (to.left >= from.right) {
    const dx = Math.max(32, (to.left - from.right) / 2)
    return `M ${from.right} ${fy} C ${from.right + dx} ${fy}, ${to.left - dx} ${ty}, ${to.left - 2} ${ty}`
  }
  if (from.left >= to.right) {
    const dx = Math.max(32, (from.left - to.right) / 2)
    return `M ${from.left} ${fy} C ${from.left - dx} ${fy}, ${to.right + dx} ${ty}, ${to.right + 2} ${ty}`
  }
  // Dans la même colonne : la courbe passe par la gauche des cartes.
  const x = Math.min(from.left, to.left)
  return `M ${x} ${fy} C ${x - 28} ${fy}, ${x - 28} ${ty}, ${x - 2} ${ty}`
}

export function DependencyLayer({ boardRef, edges, labels }: Readonly<{
  /** Le plateau des colonnes : le calque se pose sur lui, et suit son défilement et celui de chaque colonne. */
  boardRef: RefObject<HTMLElement | null>
  edges: readonly DependencyEdge[]
  labels: { readonly blocks: string; readonly blockedBy: string }
}>) {
  const [drawn, setDrawn] = useState<readonly DrawnEdge[]>([])

  // Un effet après le rendu : le plateau a son élément, même quand le calque est rendu dans lui.
  useEffect(() => {
    const board = boardRef.current
    if (!board || edges.length === 0) {
      const clear = requestAnimationFrame(() => setDrawn((was) => (was.length === 0 ? was : [])))
      return () => cancelAnimationFrame(clear)
    }
    let frame = 0
    const measure = () => {
      frame = 0
      const origin = board.getBoundingClientRect()
      const rectOf = (key: string) => {
        // Les clés sont « issue-{id} » : rien à échapper dans le sélecteur.
        const element = board.querySelector<HTMLElement>(`[data-node-key="${key}"]`)
        if (!element) return null
        const r = element.getBoundingClientRect()
        // Une carte sortie de la vue de sa colonne ne compte pas : l'arête partirait de nulle part.
        if (r.bottom < origin.top || r.top > origin.bottom || r.right < origin.left || r.left > origin.right) return null
        return { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top }
      }
      const next: DrawnEdge[] = []
      for (const edge of edges) {
        const from = rectOf(edge.from)
        const to = rectOf(edge.to)
        if (from && to) next.push({ key: `${edge.from}>${edge.to}`, d: edgePath(from, to), side: edge.side })
      }
      setDrawn(next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    schedule()
    board.addEventListener("scroll", schedule, { capture: true, passive: true })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    observer?.observe(board)
    return () => {
      board.removeEventListener("scroll", schedule, { capture: true })
      observer?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [boardRef, edges])

  if (drawn.length === 0) return null
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible">
      <defs>
        <marker id="workflow-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 6 3 L 0 6 z" className="fill-primary" />
        </marker>
      </defs>
      {drawn.map((edge) => (
        <g key={edge.key} className="pointer-events-auto">
          <title>{edge.side === "blocks" ? labels.blocks : labels.blockedBy}</title>
          <path d={edge.d} className="fill-none stroke-transparent" strokeWidth={10} />
          <path d={edge.d} className="fill-none stroke-primary" strokeWidth={2} markerEnd="url(#workflow-arrow)" />
        </g>
      ))}
    </svg>
  )
}
