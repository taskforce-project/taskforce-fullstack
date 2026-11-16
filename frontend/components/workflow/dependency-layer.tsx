"use client"

import { useEffect, useState, type RefObject } from "react"

import { MAX_EDGES, type DependencyEdge } from "@/lib/workflow/view"

/**
 * Les dépendances du nœud choisi (séance n°25, §4.8), sur un calque SVG sous les colonnes : des lignes de 2 px en
 * `--primary` et une pointe de 6 px, de ce qui bloque vers ce qui est bloqué. Sous les cartes, opaques, une ligne ne passe
 * jamais sur un texte ni sur un bouton : elle sort d'une carte par son côté, court dans la gouttière entre les colonnes, et
 * entre dans l'autre carte par son côté. Seulement pour la sélection, cinquante arêtes au plus : jamais la pelote. Une arête dont une carte n'est
 * pas à l'écran (repliée, hors de la fenêtre de sa colonne) ne se dessine pas ; l'inspecteur la liste. Avec « Show all
 * links » (décision du CEO, 16/11/2026), toutes les arêtes entre les cartes à l'écran, `limit` au plus, les plus proches
 * du centre de ce qui se voit d'abord ; au-delà, une ligne dit combien il en reste (`moreLabel`).
 */

export interface DrawnEdge {
  readonly key: string
  readonly d: string
  readonly side: DependencyEdge["side"]
  /** Un lien de la carte choisie, quand tous les liens se montrent : plein ; les autres s'estompent. */
  readonly strong: boolean
}

/** La gouttière entre deux colonnes : la moitié de l'écart entre leurs cartes (12 px de marge, un trait, 12 px de marge). */
export const GUTTER = 12

/** Le rayon des coins d'une ligne. */
const CORNER = 6

/**
 * Une ligne à angles droits arrondis : du point de départ à la gouttière (`gx`), le long de la gouttière, puis jusqu'au
 * côté de la carte d'arrivée.
 */
function guttered(sx: number, sy: number, gx: number, ex: number, ey: number): string {
  if (Math.abs(sy - ey) < 1) return `M ${sx} ${sy} H ${ex}`
  const r = Math.min(CORNER, Math.abs(ey - sy) / 2, Math.abs(gx - sx), Math.abs(ex - gx))
  const out = Math.sign(gx - sx)
  const down = Math.sign(ey - sy)
  const back = Math.sign(ex - gx)
  return `M ${sx} ${sy} H ${gx - out * r} Q ${gx} ${sy} ${gx} ${sy + down * r} V ${ey - down * r} Q ${gx} ${ey} ${gx + back * r} ${ey} H ${ex}`
}

/**
 * La ligne d'une arête, d'un rectangle à l'autre (coordonnées du calque). Vers une colonne à droite : du côté droit de la
 * carte de départ à la gouttière qui précède la colonne d'arrivée, puis dans la carte par son côté gauche ; vers la gauche,
 * l'inverse ; dans la même colonne, par la gouttière de gauche, entrée par le côté gauche.
 */
export function edgePath(
  from: { left: number; right: number; top: number; bottom: number },
  to: { left: number; right: number; top: number; bottom: number },
): string {
  const fy = (from.top + from.bottom) / 2
  const ty = (to.top + to.bottom) / 2
  if (to.left >= from.right) return guttered(from.right, fy, to.left - GUTTER, to.left - 2, ty)
  if (from.left >= to.right) return guttered(from.left, fy, to.right + GUTTER, to.right + 2, ty)
  const x = Math.min(from.left, to.left)
  return guttered(from.left, fy, x - GUTTER, to.left - 2, ty)
}

export function DependencyLayer({ boardRef, edges, labels, limit = MAX_EDGES, moreLabel, revision, focus = null }: Readonly<{
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
  /** La carte choisie, quand tous les liens se montrent : ses liens restent pleins, les autres s'estompent. */
  focus?: string | null
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
      setDrawn(seen.slice(0, limit).map(({ edge, from, to }) => ({
        key: `${edge.from}>${edge.to}`, d: edgePath(from, to), side: edge.side,
        strong: focus === null || edge.from === focus || edge.to === focus,
      })))
      // Ce qui ne se dessine pas, dit en nombre : au-delà de la limite, et les liens dont une carte n'est pas à l'écran.
      setBeyond(Math.max(0, edges.length - Math.min(seen.length, limit)))
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
  }, [boardRef, edges, limit, revision, focus])

  const more = moreLabel && beyond > 0 ? moreLabel(beyond) : null
  if (drawn.length === 0 && !more) return null
  return (
    <>
    {more && (
      <p data-links-more className="pointer-events-none absolute bottom-2 left-3 z-20 bg-background/90 px-1.5 text-xs text-muted-foreground">
        {more}
      </p>
    )}
    {/* Sous les colonnes (le plateau est au-dessus, z-10) : les cartes, opaques, cachent ce qui passe dessous. */}
    <svg aria-hidden="true" data-links-layer className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible">
      <defs>
        <marker id="workflow-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 6 3 L 0 6 z" className="fill-primary" />
        </marker>
      </defs>
      {drawn.map((edge) => (
        <g key={edge.key} data-strong={edge.strong} className={edge.strong ? undefined : "opacity-25"}>
          <title>{edge.side === "blocks" ? labels.blocks : labels.blockedBy}</title>
          <path d={edge.d} className="fill-none stroke-primary" strokeWidth={2} markerEnd="url(#workflow-arrow)" />
        </g>
      ))}
    </svg>
    </>
  )
}
