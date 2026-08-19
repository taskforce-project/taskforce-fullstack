"use client"

import { ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Bouton « descendre en bas » d'un fil de discussion (visible quand on a scrollé vers le haut). */
export function ScrollButton({
  visible, onClick, className,
}: { visible: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label="Aller en bas"
      className={cn(
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-1.5 shadow-md transition-all",
        visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        className,
      )}>
      <ArrowDown className="size-4 text-muted-foreground" />
    </button>
  )
}
