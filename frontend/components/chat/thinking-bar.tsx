"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Loader } from "@/components/ui/loader"
import { ShimmeringText } from "@/components/ui/shimmering-text"

/** Phases de réflexion de Cortex, défilées pendant la génération (donne un déroulé « vivant »). */
const PHASES = [
  "Compréhension de la demande…",
  "Recherche dans le Brain OS…",
  "Raisonnement…",
  "Rédaction de la réponse…",
]

/**
 * Indicateur « réfléchit / agit » du chat agentique. Sans `label`, fait défiler les
 * {@link PHASES} (transition shimmer à chaque phase) pour matérialiser le déroulé de réflexion.
 */
export function ThinkingBar({
  label,
  className,
  cycle = true,
}: {
  label?: string
  className?: string
  cycle?: boolean
}) {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (label || !cycle) return
    const id = setInterval(() => setI((n) => (n + 1) % PHASES.length), 1600)
    return () => clearInterval(id)
  }, [label, cycle])

  const text = label ?? PHASES[i]

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader variant="spin" size="sm" className="text-primary" />
      {/* key={text} → le shimmer redémarre à chaque phase (petite transition). */}
      <ShimmeringText key={text}>{text}</ShimmeringText>
    </span>
  )
}
