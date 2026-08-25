"use client"

import { useState } from "react"
import { Brain, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"

/**
 * Bloc de raisonnement (chain-of-thought) repliable. Pendant le streaming, affiche un
 * shimmer ; une fois terminé, le contenu markdown du raisonnement.
 */
export interface ReasoningProps {
  content: string
  isStreaming?: boolean
  defaultOpen?: boolean
  className?: string
}

export function Reasoning({ content, isStreaming = false, defaultOpen = false, className }: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen || isStreaming)
  return (
    <div className={cn("my-2 rounded-lg border bg-muted/20 text-sm", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground">
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <Brain className="size-3.5" />
        {isStreaming ? <TextShimmerWave as="span">Raisonnement…</TextShimmerWave> : <span className="font-medium">Raisonnement</span>}
      </button>
      {open && (
        <div className="border-t px-3 py-2 text-muted-foreground">
          {content ? <Markdown content={content} /> : <p className="italic">…</p>}
        </div>
      )}
    </div>
  )
}
