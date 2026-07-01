"use client"

import { useState } from "react"
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react"
import { cn } from "@/lib/utils"

/** Barre de feedback sous un message assistant : copier + pouce haut/bas. */
export function FeedbackBar({
  onCopy, onFeedback, className,
}: {
  onCopy?: () => void
  onFeedback?: (value: "up" | "down") => void
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState<"up" | "down" | null>(null)

  const copy = () => { onCopy?.(); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const send = (v: "up" | "down") => { setVote(v); onFeedback?.(v) }

  const btn = "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <button type="button" onClick={copy} className={btn} aria-label="Copier">
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      </button>
      <button type="button" onClick={() => send("up")} className={cn(btn, vote === "up" && "text-emerald-500")} aria-label="Utile">
        <ThumbsUp className="size-3.5" />
      </button>
      <button type="button" onClick={() => send("down")} className={cn(btn, vote === "down" && "text-destructive")} aria-label="Pas utile">
        <ThumbsDown className="size-3.5" />
      </button>
    </div>
  )
}
