"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/** La largeur d'un chevron et de son fondu, au bord de la bande : un onglet dessous ne se lit pas. */
const CHEVRON_EDGE = 40

/**
 * Bande d'onglets sur **une seule ligne**, scrollable horizontalement, avec des
 * chevrons gauche/droite qui n'apparaissent qu'en cas de débordement.
 * Remplace les `flex-wrap` qui cassaient l'alignement (sheet d'issue, nav projet).
 *
 * Les enfants sont les onglets eux-mêmes (boutons / `Link`). Le composant ne
 * gère que le défilement, pas l'état actif ; il garde entier l'onglet de la page
 * (`aria-current="page"`), au-delà des chevrons : à 375 px, « Workflow » se lisait
 * « Wo... » sous celui de droite (R161, M9).
 */
export function ScrollableTabs({
  children,
  className,
  scrollClassName,
  step = 200,
  activeKey = null,
}: Readonly<{
  children: React.ReactNode
  className?: string
  /** Classes sur le conteneur scrollable (ex. `border-b` pour la ligne de base des onglets). */
  scrollClassName?: string
  /** Distance (px) défilée à chaque clic sur un chevron. */
  step?: number
  /** Ce qui change quand la page change d'onglet (son chemin) : l'onglet actif revient en vue. */
  activeKey?: string | null
}>) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = React.useState(false)
  const [canRight, setCanRight] = React.useState(false)

  const update = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanLeft(scrollLeft > 1)
    setCanRight(scrollLeft + clientWidth < scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    update()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [update])

  // L'onglet de la page, entier, hors de la largeur d'un chevron et de son fondu.
  React.useEffect(() => {
    const el = scrollRef.current
    const active = el?.querySelector<HTMLElement>("[aria-current='page']")
    if (!el || !active) return
    const view = el.getBoundingClientRect()
    // Rien n'est en page (une bande cachée) : rien à faire.
    if (view.width === 0) return
    const tab = active.getBoundingClientRect()
    if (tab.right > view.right - CHEVRON_EDGE) el.scrollLeft += tab.right - (view.right - CHEVRON_EDGE)
    else if (tab.left < view.left + CHEVRON_EDGE && el.scrollLeft > 0) el.scrollLeft -= view.left + CHEVRON_EDGE - tab.left
    update()
  }, [activeKey, update])

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * step, behavior: "smooth" })
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      {canLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="absolute left-0 z-10 flex h-full items-center bg-gradient-to-r from-background via-background to-transparent pr-4 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "flex min-w-0 flex-1 flex-nowrap items-center overflow-x-auto scrollbar-hide scroll-smooth",
          scrollClassName,
        )}
      >
        {children}
      </div>

      {canRight && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="absolute right-0 z-10 flex h-full items-center bg-gradient-to-l from-background via-background to-transparent pl-4 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  )
}
