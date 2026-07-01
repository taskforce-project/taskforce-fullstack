"use client"

import { cn } from "@/lib/utils"

/** Puce de suggestion de prompt (empty state / follow-ups). */
export function PromptSuggestion({
  children, onClick, className,
}: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-xs text-muted-foreground transition-colors",
        "hover:border-foreground/20 hover:text-foreground",
        className,
      )}>
      {children}
    </button>
  )
}
