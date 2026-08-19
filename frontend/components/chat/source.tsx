"use client"

import { ExternalLink, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Source / citation. `Source` = puce unique ; `Sources` = liste (recherche web ou RAG Brain OS).
 */
export interface SourceItem {
  title: string
  url?: string
  snippet?: string
  /** Score de pertinence 0..1 (RAG). */
  score?: number
}

export function Source({ title, url, snippet, score, index }: SourceItem & { index?: number }) {
  const body = (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        {url ? <ExternalLink className="size-3.5" /> : <FileText className="size-3.5" />}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {index != null && <span className="text-[10px] text-muted-foreground">[{index}]</span>}
          <span className="truncate text-sm font-medium">{title}</span>
          {score != null && (
            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
              {(score * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {snippet && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{snippet}</p>}
      </div>
    </div>
  )
  const cls = "block rounded-lg border bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function Sources({ items, className }: { items: SourceItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <div className={cn("my-2 space-y-1.5", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sources ({items.length})
      </div>
      {items.map((it, i) => <Source key={i} index={i + 1} {...it} />)}
    </div>
  )
}
