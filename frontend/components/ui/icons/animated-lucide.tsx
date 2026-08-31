"use client"

import { forwardRef, useImperativeHandle } from "react"
import { HelpCircle, Settings2, type LucideIcon } from "lucide-react"
import {
  LazyMotion,
  domMin,
  m,
  useAnimation,
  useReducedMotion,
  type Variants,
} from "framer-motion"

import { cn } from "@/lib/utils"
import type { AnimatedIconHandle } from "./types"

/**
 * Repli générique pour les glyphes lucide sans équivalent chez animateicons.in : on garde le glyphe
 * EXACT (pas de substitution) et on l'anime au niveau du conteneur - petit ressort + inclinaison -
 * au survol de la ligne. Même contrat impératif ({@link AnimatedIconHandle}) que les composants
 * bespoke, donc pilotable par ref de la même façon (cf. AnimatedNavIcon).
 */
const wobble: Variants = {
  normal: { rotate: 0, scale: 1 },
  animate: {
    rotate: [0, -11, 9, -5, 0],
    scale: [1, 1.12, 1.06, 1.1, 1],
    transition: { duration: 0.6, ease: "easeInOut" },
  },
}

function makeAnimatedLucide(Icon: LucideIcon, displayName: string) {
  const Comp = forwardRef<
    AnimatedIconHandle,
    { size?: number; isAnimated?: boolean; className?: string }
  >(({ size = 16, className }, ref) => {
    const controls = useAnimation()
    const reduced = useReducedMotion()

    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        if (!reduced) controls.start("animate")
      },
      stopAnimation: () => controls.start("normal"),
    }))

    return (
      <LazyMotion features={domMin} strict>
        <m.span
          className={cn("relative inline-flex", className)}
          style={{ transformOrigin: "center" }}
          initial="normal"
          animate={controls}
          variants={wobble}
        >
          <Icon size={size} />
        </m.span>
      </LazyMotion>
    )
  })
  Comp.displayName = displayName
  return Comp
}

/** Réglages (glyphe lucide Settings2 conservé - animateicons.in n'a pas `settings-2`). */
export const Settings2Icon = makeAnimatedLucide(Settings2, "Settings2Icon")
/** Aide (glyphe lucide HelpCircle conservé - animateicons.in n'a pas `circle-help`). */
export const HelpCircleIcon = makeAnimatedLucide(HelpCircle, "HelpCircleIcon")
