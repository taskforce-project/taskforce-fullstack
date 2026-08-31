import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface BorderBeamProps {
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  className?: string
  style?: CSSProperties
  reverse?: boolean
  initialOffset?: number
  borderWidth?: number
}

/**
 * BorderBeam - Magic UI, réécrit SANS `motion` : le faisceau parcourt le bord via `offset-path`
 * + une animation CSS (@keyframes border-beam-move, dans global.css). Motif : `motion/react`
 * cassait l'hydratation des îlots (double instance React) dans notre setup Astro/Vite - même
 * parti pris que pour l'Aurora (on retire la dépendance plutôt que de la combattre).
 */
export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={{ "--border-beam-width": `${borderWidth}px` } as CSSProperties}
    >
      <div
        className={cn(
          "absolute aspect-square bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent",
          className
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            offsetDistance: `${initialOffset}%`,
            animation: `border-beam-move ${duration}s linear infinite`,
            animationDelay: `${-delay}s`,
            animationDirection: reverse ? "reverse" : "normal",
            "--color-from": colorFrom,
            "--color-to": colorTo,
            ...style,
          } as CSSProperties
        }
      />
    </div>
  )
}
