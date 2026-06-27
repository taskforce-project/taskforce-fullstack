"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Bande d'onglets sur **une seule ligne**, scrollable horizontalement, avec des
 * chevrons gauche/droite qui n'apparaissent qu'en cas de débordement.
 * Remplace les `flex-wrap` qui cassaient l'alignement (sheet d'issue, nav projet).
 *
 * Les enfants sont les onglets eux-mêmes (boutons / `Link`). Le composant ne
 * gère que le défilement, pas l'état actif.
 */
export function ScrollableTabs({
  children,
  className,
  scrollClassName,
  step = 200,
}: Readonly<{
  children: React.ReactNode
  className?: string
  /** Classes sur le conteneur scrollable (ex. `border-b` pour la ligne de base des onglets). */
  scrollClassName?: string
  /** Distance (px) défilée à chaque clic sur un chevron. */
  step?: number
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

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * step, behavior: "smooth" })
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      {canLeft && (
        <button
          type="button"
          aria-label="Défiler à gauche"
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
          aria-label="Défiler à droite"
          onClick={() => scrollBy(1)}
          className="absolute right-0 z-10 flex h-full items-center bg-gradient-to-l from-background via-background to-transparent pl-4 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  )
}
