"use client"

import { useId, useState } from "react"
import { ChevronRight, LoaderCircle } from "lucide-react"

import type { ContextRead } from "@/lib/api/assistant-service"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { compactedLine, contextFitLine } from "@/lib/cortex/context-line"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/**
 * Ce que TaskForce a dû faire pour que la requête tienne la fenêtre du modèle (TF-J1-13) : une ligne calme avant la
 * réponse, le détail au survol (R129), comme la ligne grise (R123). Rien quand rien n'a été touché.
 */
export function ContextFitNotice({ context, model }: Readonly<{ context: ContextRead | null | undefined; model: string | null | undefined }>) {
  const t = usePreferencesStore((s) => s.t.contextFit)
  const fit = contextFitLine(context, model, t)
  if (!fit) return null
  return <p className="truncate text-xs text-muted-foreground" title={fit.detail}>{fit.line}</p>
}

/**
 * Ce que dit « /compact » (TF-J1-15) : une ligne de même hauteur du début à la fin, là où viendra le résultat. Elle travaille,
 * puis elle dit ce qui s'est passé, et le résumé s'ouvre d'un chevron. Le fil au-dessus ne bouge pas et reste entier
 * (« la ca supp tout le context ??? ») : seul ce qui part au modèle est plus court.
 */
export function CompactedNotice({ compacted, compacting = false, summary = null, problem }: Readonly<{
  compacted: number
  compacting?: boolean
  summary?: string | null
  problem?: string
}>) {
  const t = usePreferencesStore((s) => s.t.contextFit)
  const [open, setOpen] = useState(false)
  const id = useId()

  if (compacting) {
    return (
      <p role="status" className="my-3 flex h-6 items-center justify-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
        {t.compacting}
      </p>
    )
  }
  if (problem) {
    return <p role="alert" className="my-3 text-center text-xs text-destructive">{problem}</p>
  }
  const { line, detail } = compactedLine(compacted, t)
  if (!summary) return <p className="my-3 flex min-h-6 items-center justify-center text-center text-xs text-muted-foreground" title={detail}>{line}</p>
  const name = open ? t.hideSummary : t.showSummary
  return (
    <div className="my-3 text-xs text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`${name}. ${detail}`}
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex h-6 items-center gap-1 transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      >
        <span>{line}</span>
        <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {open && (
        <div id={id} className="mx-auto mt-1 max-w-[560px] border-l border-border pl-3 text-left">
          <p className="mb-1">{t.summaryIntro}</p>
          <div className="text-foreground"><Markdown content={summary} /></div>
        </div>
      )}
    </div>
  )
}
