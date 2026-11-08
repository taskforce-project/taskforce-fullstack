import { useLayoutEffect, useState, type RefObject } from "react"
import { flushSync } from "react-dom"

/**
 * La largeur d'un élément, en px, suivie par un `ResizeObserver` : 0 tant qu'il n'est pas mesuré. L'observation part
 * avant que la fenêtre se peigne, et chaque mesure se rend aussitôt : le premier écran a déjà la bonne largeur. La
 * fenêtre (R120) en tire la place du volet à côté de la conversation.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const measured = entries.at(-1)?.contentRect.width
      if (measured !== undefined) flushSync(() => setWidth(Math.round(measured)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
