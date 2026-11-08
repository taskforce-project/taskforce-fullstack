"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { BIG_STEP, clampWidth, MIN_PANE, STEP } from "@/lib/window/split"

/**
 * La poignée entre la conversation et le volet (R120, « Le dessin », séance n°18) : on la tire pour régler la largeur
 * du volet, que la fenêtre retient pour la personne ; un double-clic la ramène à la moitié de la place. Elle se prend au
 * clavier : les flèches la déplacent (Maj pour un grand pas), Début et Fin la mènent au plus étroit et au plus large.
 * La largeur suit le pointeur sans animation ; seule sa couleur change, et pas du tout quand le système demande moins
 * de mouvement.
 */
export function PaneHandle({ width, max, onDrag, onCommit, onReset }: Readonly<{
  /** La largeur du volet (px), null tant qu'elle n'est pas mesurée. */
  width: number | null
  /** La plus grande largeur que la conversation laisse au volet. */
  max: number
  /** Pendant le geste : la largeur que le pointeur donne ; null quand il finit sans rien changer. */
  onDrag: (width: number | null) => void
  /** La largeur retenue, à la fin du geste ou à chaque pas du clavier. */
  onCommit: (width: number) => void
  /** Le double-clic : la moitié de la place. */
  onReset: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.window)
  const start = useRef<{ x: number; width: number; last: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const current = width ?? MIN_PANE

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || width === null) return
    // Pas de sélection de texte pendant le geste ; la poignée prend le focus, et les flèches la suivent.
    e.preventDefault()
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    start.current = { x: e.clientX, width, last: width }
    setDragging(true)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const from = start.current
    if (!from) return
    // Le volet est à droite de la poignée : la tirer vers la gauche l'élargit.
    const next = clampWidth(from.width + from.x - e.clientX, max)
    if (next === from.last) return
    from.last = next
    onDrag(next)
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const from = start.current
    if (!from) return
    start.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // Un clic sans geste ne retient rien : la moitié de la place reste la moitié.
    if (from.last !== from.width) onCommit(from.last)
    else onDrag(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (width === null) return
    const step = e.shiftKey ? BIG_STEP : STEP
    const next = {
      ArrowLeft: width + step,
      ArrowRight: width - step,
      Home: MIN_PANE,
      End: max,
    }[e.key]
    if (next === undefined) return
    e.preventDefault()
    onCommit(clampWidth(next, max))
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizePane}
      aria-valuenow={current}
      aria-valuemin={MIN_PANE}
      aria-valuemax={Number.isFinite(max) ? Math.max(max, MIN_PANE) : undefined}
      title={t.resizeHint}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none select-none outline-none",
        "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border",
        "before:transition-colors before:duration-150 motion-reduce:before:transition-none",
        "hover:before:w-0.5 hover:before:bg-primary/50 focus-visible:before:w-0.5 focus-visible:before:bg-primary",
        dragging && "before:w-0.5 before:bg-primary",
      )}
    />
  )
}
