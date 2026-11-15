"use client"

import {
  Circle, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleSlash, CircleStop, Clock, FileQuestion, LoaderCircle,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { WorkflowState } from "@/lib/workflow/states"

/**
 * La marque d'un état (séance n°25, §4.4) : une icône de `lucide-react` d'un trait, sa couleur, et toujours son mot (au
 * survol et pour un lecteur d'écran, ou écrit à côté). Seul « Working » bouge : un tour en 1,2 s, fixe quand le système
 * demande moins de mouvement, et fixe pour une issue qu'une personne tient sans mission (`still`) : seul l'anneau d'une
 * mission au travail tourne.
 */
const MARKS: Readonly<Record<WorkflowState, { icon: LucideIcon; tone: string }>> = {
  needsYou: { icon: CircleDot, tone: "text-primary" },
  failed: { icon: CircleAlert, tone: "text-destructive" },
  missing: { icon: FileQuestion, tone: "text-ink-yellow" },
  blocked: { icon: CircleSlash, tone: "text-ink-yellow" },
  working: { icon: LoaderCircle, tone: "text-primary" },
  waiting: { icon: Clock, tone: "text-muted-foreground" },
  notStarted: { icon: Circle, tone: "text-subtle" },
  done: { icon: CircleCheck, tone: "text-ink-green" },
  skipped: { icon: CircleDashed, tone: "text-subtle" },
  stopped: { icon: CircleStop, tone: "text-subtle" },
}

/** Le tour de l'anneau d'une mission au travail : 1,2 s, fixe quand le système demande moins de mouvement. */
const SPIN = "animate-spin [animation-duration:1.2s] motion-reduce:animate-none"

/** La barre de gauche (3 px), seulement pour ce qui demande l'attention (§4.1). */
export const STATE_BAR: Readonly<Partial<Record<WorkflowState, string>>> = {
  needsYou: "bg-primary",
  failed: "bg-destructive",
  missing: "bg-shape-yellow",
}

/** L'encre de la phrase : celle du texte pour ce qui demande l'attention, plus douce sinon (§4.1). */
export const SENTENCE_INK: Readonly<Partial<Record<WorkflowState, string>>> = {
  needsYou: "text-foreground",
  failed: "text-foreground",
  missing: "text-foreground",
}

export function StateMark({ state, word, size = 16, showWord = false, still = false, className }: Readonly<{
  state: WorkflowState
  /** Le mot de l'état, dans la langue de l'écran. */
  word: string
  size?: 12 | 16
  /** Le mot écrit à côté de la marque, et non seulement au survol. */
  showWord?: boolean
  /** La marque ne bouge pas : une issue en cours tenue par une personne, sans mission au travail. */
  still?: boolean
  className?: string
}>) {
  const { icon: Icon, tone } = MARKS[state]
  const mark = (
    <Icon
      aria-hidden="true"
      className={cn(size === 16 ? "size-4" : "size-3", "shrink-0 transition-colors duration-150 motion-reduce:transition-none", tone,
        state === "working" && !still && SPIN)}
      strokeWidth={2}
    />
  )
  if (showWord) {
    return (
      <span data-state={state} className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
        {mark}
        <span className="truncate">{word}</span>
      </span>
    )
  }
  return (
    <span role="img" aria-label={word} title={word} data-state={state} className={cn("inline-flex shrink-0", className)}>
      {mark}
    </span>
  )
}
