"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Barre sous un message assistant : copier la réponse. Les pouces haut et bas ne faisaient que changer de couleur,
 * sans rien envoyer : retirés (PC-062).
 */
export function FeedbackBar({
  onCopy, className,
}: {
  onCopy?: () => void
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => { onCopy?.(); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const btn = "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <button type="button" onClick={copy} className={btn} aria-label="Copy">
        {copied ? <Check className="size-3.5 text-ink-green" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}
