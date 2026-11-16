"use client"

import { useEffect, useState, type RefObject } from "react"

import { MAX_EDGES, type DependencyEdge } from "@/lib/workflow/view"

/**
 * Les dépendances du nœud choisi (séance n°25, §4.8), sur un calque SVG au-dessus des colonnes : des courbes de 2 px en
 * `--primary` et une pointe de 6 px, de ce qui bloque vers ce qui est bloqué ; au survol d'une arête, « Blocks » ou
 * « Blocked by ». Seulement pour la sélection, cinquante arêtes au plus : jamais la pelote. Une arête dont une carte n'est
 * pas à l'écran (repliée, hors de la fenêtre de sa colonne) ne se dessine pas ; l'inspecteur la liste. Avec « Show all
 * links » (décision du CEO, 16/11/2026), toutes les arêtes entre les cartes à l'écran, `limit` au plus, les plus proches
 * du centre de ce qui se voit d'abord ; au-delà, une ligne dit combien il en reste (`moreLabel`).
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

export function DependencyLayer({ boardRef, edges, labels, limit = MAX_EDGES, moreLabel, revision }: Readonly<{
  /** Le plateau des colonnes : le calque se pose sur lui, et suit son défilement et celui de chaque colonne. */
  boardRef: RefObject<HTMLElement | null>
  edges: readonly DependencyEdge[]
  labels: { readonly blocks: string; readonly blockedBy: string }
  /** Les arêtes dessinées, au plus : les plus proches du centre de ce qui se voit d'abord. */
  limit?: number
  /** La ligne des arêtes au-delà de la limite ; sans elle, rien ne se dit (l'inspecteur le dit pour un nœud choisi). */
  moreLabel?: (count: number) => string
  /**
   * Ce qui change la mise en page sans défilement (la densité, le filtre, ce qui se déplie, les données) : chaque valeur
   * nouvelle remesure les cartes, et les courbes ne restent jamais là où les cartes étaient.
   */
  revision?: unknown
}>) {
  const [drawn, setDrawn] = useState<readonly DrawnEdge[]>([])
  const [beyond, setBeyond] = useState(0)

  // Un effet après le rendu : le plateau a son élément, même quand le calque est rendu dans lui.
  useEffect(() => {
    const board = boardRef.current
    if (!board || edges.length === 0) {
      const clear = requestAnimationFrame(() => {
        setDrawn((was) => (was.length === 0 ? was : []))
        setBeyond(0)
      })
      return () => cancelAnimationFrame(clear)
    }
    let frame = 0
    const measure = () => {
      frame = 0
      const origin = board.getBoundingClientRect()
      // Les cartes rendues, mesurées une fois : des milliers d'arêtes se filtrent sans chercher chaque carte dans la page.
      const rects = new Map<string, { left: number; right: number; top: number; bottom: number }>()
      for (const element of board.querySelectorAll<HTMLElement>("[data-node-key]")) {
        const key = element.dataset.nodeKey
        if (!key) continue
        const r = element.getBoundingClientRect()
        // Une carte sortie de la vue de sa colonne ne compte pas : l'arête partirait de nulle part.
        if (r.bottom < origin.top || r.top > origin.bottom || r.right < origin.left || r.left > origin.right) continue
        rects.set(key, { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top })
      }
      const centerX = origin.width / 2
      const centerY = origin.height / 2
      const seen: { edge: DependencyEdge; from: NonNullable<ReturnType<typeof rects.get>>; to: NonNullable<ReturnType<typeof rects.get>>; distance: number }[] = []
      for (const edge of edges) {
        const from = rects.get(edge.from)
        const to = rects.get(edge.to)
        if (!from || !to) continue
        const x = (from.left + from.right + to.left + to.right) / 4
        const y = (from.top + from.bottom + to.top + to.bottom) / 4
        seen.push({ edge, from, to, distance: Math.hypot(x - centerX, y - centerY) })
      }
      // Les plus proches du centre de ce qui se voit d'abord, la limite au plus.
      seen.sort((a, b) => a.distance - b.distance)
      setDrawn(seen.slice(0, limit).map(({ edge, from, to }) => ({ key: `${edge.from}>${edge.to}`, d: edgePath(from, to), side: edge.side })))
      setBeyond(Math.max(0, seen.length - limit))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    schedule()
    board.addEventListener("scroll", schedule, { capture: true, passive: true })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    observer?.observe(board)
    // Une carte qui naît, part ou change de contenu (une densité, une ligne de plus) déplace les autres : on remesure.
    const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule)
    mutations?.observe(board, { childList: true, subtree: true })
    return () => {
      board.removeEventListener("scroll", schedule, { capture: true })
      observer?.disconnect()
      mutations?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [boardRef, edges, limit, revision])

  if (drawn.length === 0) return null
  return (
    <>
    {moreLabel && beyond > 0 && (
      <p data-links-more className="pointer-events-none absolute bottom-2 left-3 z-20 bg-background/90 px-1.5 text-xs text-muted-foreground">
        {moreLabel(beyond)}
      </p>
    )}
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
    </>
  )
}
