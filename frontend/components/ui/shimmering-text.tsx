"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Texte avec un reflet animé qui balaie (façon « shimmering-text » d'ElevenLabs UI).
 * Implémenté maison (registry ElevenLabs inaccessible - Vercel checkpoint).
 * Idéal pour un état « réfléchit… » / chargement.
 */
export function ShimmeringText({
  children,
  className,
  duration = 2,
}: {
  readonly children: React.ReactNode
  readonly className?: string
  /** Durée d'un balayage (secondes). */
  readonly duration?: number
}) {
  return (
    <span
      className={cn("inline-block bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)",
        backgroundSize: "200% 100%",
        animation: `tf-shimmer ${duration}s linear infinite`,
      }}
    >
      {children}
    </span>
  )
}
