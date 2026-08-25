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

  return (
    <TextShimmerWave as="span" key={text} className={className}>
      {text}
    </TextShimmerWave>
  )
}
