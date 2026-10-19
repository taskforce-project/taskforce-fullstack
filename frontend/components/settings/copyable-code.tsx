"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Bloc de commandes ou de configuration à copier, avec son libellé (réglages des agents). */
export function CopyableCode({ label, text }: Readonly<{ label: string; text: string }>) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.")
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px]" onClick={onCopy} aria-label={`Copy: ${label}`}>
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">{text}</pre>
    </div>
  )
}
