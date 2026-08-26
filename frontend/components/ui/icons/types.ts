import type * as React from "react"

/** Poignée impérative commune à toutes les icônes animées (registry animateicons + repli lucide). */
export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

/**
 * Forme commune d'un composant d'icône animée, pilotable par ref. Les composants bespoke issus
 * d'animateicons.in exposent des props supplémentaires (optionnelles) ; ce contrat retient le
 * sous-ensemble dont on se sert pour les piloter depuis une ligne de menu.
 */
export type AnimatedIconComponent = React.ForwardRefExoticComponent<
  React.RefAttributes<AnimatedIconHandle> & {
    size?: number
    duration?: number
    isAnimated?: boolean
    color?: string
    className?: string
  }
>
