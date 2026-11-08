"use client"

import { Named } from "@/components/progress/named"
import type { CapabilitySign as Sign } from "@/lib/ai/model-table"
import { cn } from "@/lib/utils"

const TONE: Readonly<Record<Sign, string>> = {
  passed: "text-ink-green",
  partly: "text-ink-yellow",
  failed: "text-ink-red",
  none: "text-muted-foreground/60",
}

/** Le dessin d'un signe, 16 px de large : point plein, demi-point, cercle, tiret (« Le dessin », séance n°19). */
function Glyph({ sign }: Readonly<{ sign: Sign }>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4", TONE[sign])}>
      {sign === "passed" && <circle cx="8" cy="8" r="4" fill="currentColor" />}
      {sign === "partly" && (
        <>
          <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 4.5a3.5 3.5 0 0 0 0 7z" fill="currentColor" />
        </>
      )}
      {sign === "failed" && <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.25" />}
      {sign === "none" && <path d="M5 8h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />}
    </svg>
  )
}

/**
 * Un signe par capacité (R130) : réussie, en partie, ratée, pas mesurée. La forme dit l'état, pas seulement la couleur ; le
 * nom de la capacité et sa note sont au survol et pour les lecteurs d'écran.
 */
export function CapabilitySign({ sign, name }: Readonly<{ sign: Sign; name: string }>) {
  return (
    <Named name={name}>
      <span role="img" aria-label={name} className="block size-4 shrink-0">
        <Glyph sign={sign} />
      </span>
    </Named>
  )
}
