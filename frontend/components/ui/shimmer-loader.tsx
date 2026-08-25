"use client"

import { useEffect, useState } from "react"
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"

/**
 * Texte shimmer qui **boucle** sur plusieurs messages pendant un chargement IA (~1.8 s / message).
 * `key={text}` sur le shimmer → petite transition à chaque message. Rendu inline (`as="span"`),
 * à poser à côté d'un spinner. Un seul message → pas de boucle (statique).
 */
export function ShimmerLoader({
  phrases,
  className,
  interval = 1800,
}: {
  readonly phrases: readonly string[]
  readonly className?: string
  readonly interval?: number
}) {
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    if (phrases.length <= 1) return
    const id = setInterval(() => setI((n) => (n + 1) % phrases.length), interval)
    return () => clearInterval(id)
  }, [phrases, interval])

  const text = phrases[i % phrases.length] ?? ""

  // Pas de `key={text}` : on ne remonte pas le shimmer à chaque message (ça le remettait à zéro) —
  // le texte change en place et la vague CONTINUE. `repeatDelay` court : sinon la vague fait une
  // longue pause (proportionnelle à la longueur) et on voyait « le texte défiler sans animation ».
  return (
    <TextShimmerWave as="span" className={className} transition={{ repeatDelay: 0.2 }}>
      {text}
    </TextShimmerWave>
  )
}
