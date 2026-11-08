"use client"

import type { ContextRead } from "@/lib/api/assistant-service"
import { compactedLine, contextFitLine } from "@/lib/cortex/context-line"
import { usePreferencesStore } from "@/lib/store/preferences-store"

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

/** Ce que dit « /compact » : une ligne dans le fil, à la place d'une réponse. */
export function CompactedNotice({ compacted }: Readonly<{ compacted: number }>) {
  const t = usePreferencesStore((s) => s.t.contextFit)
  const { line, detail } = compactedLine(compacted, t)
  return <p className="my-3 text-center text-xs text-muted-foreground" title={detail}>{line}</p>
}
