"use client"

import type { ReactElement, ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Assez long pour qu'un passage de la souris n'allume pas une bulle, assez court pour une icône qu'on interroge. */
const NAME_DELAY_MS = 150

/**
 * Le nom d'une chose au survol (R129, séance n°19) : l'icône d'abord, son nom à un survol. L'enfant porte lui-même son nom
 * pour les lecteurs d'écran (`aria-label`, ou son texte) ; un bouton désactivé passe par un `span` pour recevoir le survol.
 */
export function Named({ name, children, wide = false }: Readonly<{
  name: ReactNode
  children: ReactElement
  /** Une phrase plutôt qu'un nom : la bulle reste lisible. */
  wide?: boolean
}>) {
  return (
    <Tooltip delayDuration={NAME_DELAY_MS}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className={wide ? "max-w-72" : undefined}>{name}</TooltipContent>
    </Tooltip>
  )
}
