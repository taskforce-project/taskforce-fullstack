"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"

/**
 * Une liste qui ne rend que ce qui est à l'écran (séance n°25, §10 : « seules les cartes visibles se rendent »), pour les
 * colonnes du workflow : 2 000 issues dans un projet n'en rendent que quelques dizaines. Chaque ligne a une hauteur
 * estimée, remplacée par sa mesure dès qu'elle s'est rendue ; au-dessus et au-dessous de ce qui se voit, un espace de la
 * même hauteur garde la barre de défilement juste. Le défilement de la personne n'est jamais touché, sauf pour amener
 * sous ses yeux le nœud qu'elle vient de choisir au clavier (`revealKey`).
 */

/** Ce qu'on rend au-delà de ce qui se voit, en pixels, au-dessus et au-dessous. */
export const OVERSCAN_PX = 480

/** Sans mesure (un premier rendu, un test), la hauteur supposée de ce qui se voit. */
export const FALLBACK_VIEWPORT = 900

export interface WindowedRow {
  readonly key: string
}

/** Ce qui se rend d'une liste : la première et la dernière ligne, et l'espace au-dessus et au-dessous. */
export interface RowWindow {
  readonly start: number
  readonly end: number
  readonly before: number
  readonly after: number
  /** Le haut de chaque ligne, pour amener l'une d'elles sous les yeux. */
  readonly offsets: readonly number[]
}

/** Une logique pure : ce qui se rend, d'après les hauteurs connues et ce qui se voit. */
export function rowWindow(
  heights: readonly number[], gap: number, top: number, seen: number, overscan = OVERSCAN_PX,
): RowWindow {
  const offsets: number[] = new Array(heights.length)
  let y = 0
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = y
    y += heights[i] + gap
  }
  if (heights.length === 0) return { start: 0, end: -1, before: 0, after: 0, offsets }
  const total = y - gap
  const from = top - overscan
  const to = top + seen + overscan
  let start = 0
  while (start < heights.length - 1 && offsets[start] + heights[start] < from) start++
  let end = start
  while (end < heights.length - 1 && offsets[end + 1] <= to) end++
  return { start, end, before: offsets[start], after: Math.max(0, total - (offsets[end] + heights[end])), offsets }
}

export function WindowedRows<R extends WindowedRow>({ rows, estimate, gap, scrollRef, revealKey, renderRow }: Readonly<{
  rows: readonly R[]
  /** La hauteur supposée d'une ligne pas encore mesurée. */
  estimate: (row: R) => number
  /** L'écart entre deux lignes, en pixels. */
  gap: number
  /** L'élément qui défile. */
  scrollRef: RefObject<HTMLElement | null>
  /** Une ligne à amener sous les yeux quand elle change (le nœud choisi au clavier). */
  revealKey?: string | null
  renderRow: (row: R) => ReactNode
}>) {
  const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map())
  const [viewport, setViewport] = useState({ top: 0, height: 0 })

  // Ce qui se voit : relu à chaque défilement (une fois par image) et à chaque changement de taille. Un effet, pas un effet
  // de mise en page : l'élément qui défile appartient au parent, et React ne pose sa référence qu'après les effets de mise
  // en page de ses enfants. Lue trop tôt, elle était vide, et la colonne ne suivait jamais le défilement (R161, H1).
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    let frame = 0
    const read = () => {
      frame = 0
      setViewport((was) => (was.top === element.scrollTop && was.height === element.clientHeight
        ? was : { top: element.scrollTop, height: element.clientHeight }))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read) }
    schedule()
    element.addEventListener("scroll", schedule, { passive: true })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    observer?.observe(element)
    return () => {
      element.removeEventListener("scroll", schedule)
      observer?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [scrollRef])

  // Une mesure par ligne rendue, une seule observation pour toute la liste ; une mesure qui ne change rien ne rend rien.
  const remember = useCallback((entries: readonly (readonly [string, number])[]) => {
    setMeasured((was) => {
      let next: Map<string, number> | null = null
      for (const [key, height] of entries) {
        if (height > 0 && was.get(key) !== height) {
          next ??= new Map(was)
          next.set(key, height)
        }
      }
      return next ?? was
    })
  }, [])
  const observer = useRef<ResizeObserver | null>(null)
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver((entries) => {
      remember(entries.map((entry) => [
        (entry.target as HTMLElement).dataset.rowKey ?? "",
        Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height),
      ] as const).filter(([key]) => key !== ""))
    })
    observer.current = watch
    return () => {
      watch.disconnect()
      observer.current = null
    }
  }, [remember])
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const key = element.dataset.rowKey
    if (key && element.offsetHeight > 0) remember([[key, element.offsetHeight]])
    observer.current?.observe(element)
  }, [remember])

  const heights = rows.map((row) => measured.get(row.key) ?? estimate(row))
  const seen = viewport.height > 0 ? viewport.height : FALLBACK_VIEWPORT
  const { start, end, before, after, offsets } = rowWindow(heights, gap, viewport.top, seen)

  // Le nœud choisi au clavier : amené sous les yeux s'il n'y est pas, une fois par choix.
  const revealed = useRef<string | null>(null)
  const revealIndex = revealKey ? rows.findIndex((row) => row.key === revealKey) : -1
  const revealTop = revealIndex >= 0 ? offsets[revealIndex] : null
  const revealBottom = revealIndex >= 0 ? offsets[revealIndex] + heights[revealIndex] : null
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || !revealKey || revealTop === null || revealBottom === null || revealed.current === revealKey) return
    revealed.current = revealKey
    const height = element.clientHeight || FALLBACK_VIEWPORT
    if (revealTop < element.scrollTop) element.scrollTop = Math.max(0, revealTop - gap)
    else if (revealBottom > element.scrollTop + height) element.scrollTop = revealBottom - height + gap
  }, [scrollRef, revealKey, revealTop, revealBottom, gap])

  if (rows.length === 0) return null
  return (
    <div style={{ paddingTop: before, paddingBottom: after }}>
      <div className="flex flex-col" style={{ gap }}>
        {rows.slice(start, end + 1).map((row) => (
          <div key={row.key} data-row-key={row.key} ref={measure}>
            {renderRow(row)}
          </div>
        ))}
      </div>
    </div>
  )
}
