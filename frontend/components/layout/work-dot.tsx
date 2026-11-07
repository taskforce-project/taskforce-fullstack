"use client"

import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import type { WorkState } from "@/lib/window/missions"

const COLOR: Record<WorkState, string> = {
  working: "bg-primary",
  waiting: "bg-shape-yellow",
  failed: "bg-shape-red",
  done: "bg-muted-foreground/35",
}

/** L'état d'un travail en un point (R57) : au travail, en attente de vous, en échec, terminé ; son nom au survol. */
export function WorkDot({ state, className }: Readonly<{ state: WorkState; className?: string }>) {
  const label = usePreferencesStore((s) => s.t.window.states[state])
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-state={state}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", COLOR[state], className)}
    />
  )
}
