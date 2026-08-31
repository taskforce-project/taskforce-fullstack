"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Loader } from "@/components/ui/loader"
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"

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
  phases = PHASES,
}: {
  label?: string
  className?: string
  cycle?: boolean
  /** Phases défilées (sans `label`) - surchargeable par contexte (chat, suggestion de compétences…). */
  phases?: string[]
}) {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (label || !cycle) return
    const id = setInterval(() => setI((n) => (n + 1) % phases.length), 1600)
    return () => clearInterval(id)
  }, [label, cycle, phases.length])

  const text = label ?? phases[i % phases.length]

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader variant="spin" size="sm" className="text-primary" />
      {/* Pas de `key` : la vague CONTINUE quand la phase change (sinon reset visible). `repeatDelay`
          court → animation quasi-continue (le défaut fait une longue pause selon la longueur). */}
      <TextShimmerWave as="span" transition={{ repeatDelay: 0.2 }}>{text}</TextShimmerWave>
    </span>
  )
}
