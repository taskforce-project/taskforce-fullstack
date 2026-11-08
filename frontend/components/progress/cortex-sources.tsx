"use client"

import { useEffect } from "react"

import { ProgressSection } from "@/components/progress/progress-section"
import { sourceLines } from "@/lib/progress/sources"
import { useCortexSourcesStore } from "@/lib/store/cortex-sources-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Ce que Cortex sait de l'espace (R125) : les sources qu'il lit pour la personne (projets, issues, commentaires, notes,
 * documents, outils connectés), comptées, avec la date de leur dernier changement. Des contenus, jamais des gestes (R57).
 */
export function CortexSources({ slug }: Readonly<{ slug: string }>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const sources = useCortexSourcesStore((s) => s.sources)
  const failed = useCortexSourcesStore((s) => s.failed)
  const fetchSources = useCortexSourcesStore((s) => s.fetchSources)

  useEffect(() => {
    if (slug) void fetchSources(slug)
  }, [slug, fetchSources])

  return (
    <ProgressSection title={tp.knows} hint={tp.knowsHint}>
      {sources === null ? (
        <p className="text-xs text-muted-foreground">{failed ? tp.readFailed : tp.reading}</p>
      ) : (
        <dl className="divide-y divide-border/50">
          {sourceLines(sources, tp).map((line) => (
            <div key={line.key} className="flex items-baseline gap-3 py-1.5 text-xs">
              <dt className="min-w-0 flex-1 text-foreground">{line.label}</dt>
              <dd className="shrink-0 tabular-nums text-foreground">{line.count}</dd>
              <dd className="w-28 shrink-0 text-right text-muted-foreground">{line.changed ?? ""}</dd>
            </div>
          ))}
        </dl>
      )}
    </ProgressSection>
  )
}
