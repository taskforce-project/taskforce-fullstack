"use client"

import { useEffect, useRef } from "react"

import type {
  AnimatedIconComponent,
  AnimatedIconHandle,
} from "@/components/ui/icons/types"

/**
 * Rend une icône animée (bespoke animateicons ou repli lucide) et déclenche son animation au survol
 * de la LIGNE de menu entière - pas seulement du petit glyphe. Plutôt que de câbler des handlers dans
 * chaque branche de rendu de la sidebar, on lie l'écouteur au plus proche `a`/`button` ancêtre (la
 * ligne shadcn `SidebarMenuButton`, rendue tantôt en lien tantôt en bouton).
 *
 * <p>`isAnimated={false}` coupe l'auto-survol interne du composant : c'est nous qui pilotons via la
 * ref, sur la vraie zone de survol. Le `<span display:contents>` n'ajoute aucune boîte de mise en
 * page (l'icône reste l'élément flex de la ligne) tout en donnant un point d'ancrage pour `closest`.</p>
 */
export function AnimatedNavIcon({
  icon: Icon,
  size = 16,
}: {
  readonly icon: AnimatedIconComponent
  readonly size?: number
}) {
  const handle = useRef<AnimatedIconHandle>(null)
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const row = host.current?.closest("a,button")
    if (!row) return

    const enter = () => handle.current?.startAnimation()
    const leave = () => handle.current?.stopAnimation()
    row.addEventListener("mouseenter", enter)
    row.addEventListener("mouseleave", leave)
    return () => {
      row.removeEventListener("mouseenter", enter)
      row.removeEventListener("mouseleave", leave)
    }
  }, [])

  return (
    <span ref={host} className="contents">
      <Icon ref={handle} size={size} isAnimated={false} className="shrink-0" />
    </span>
  )
}
