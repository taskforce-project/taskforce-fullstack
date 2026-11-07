import { useSyncExternalStore } from "react"

/**
 * La fenêtre est-elle au moins large de `px` pixels ? Suit `matchMedia`, sans écart d'hydratation : le rendu serveur
 * suppose la largeur d'un ordinateur, le client se corrige à son premier rendu. La fenêtre (R119) en dépend : le volet
 * à côté de la conversation dès `lg`, la zone de droite qui se replie sous 1 600 px.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}
