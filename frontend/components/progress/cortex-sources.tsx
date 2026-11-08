"use client"

import { useEffect } from "react"
import { CircleDot, FileText, FolderKanban, MessageSquare, NotebookPen, Plug, type LucideIcon } from "lucide-react"

import { Named } from "@/components/progress/named"
import { Button } from "@/components/ui/button"
import type { CortexSourceKey } from "@/lib/api/cortex-sources-service"
import { sourceLines } from "@/lib/progress/sources"
import { useCortexSourcesStore } from "@/lib/store/cortex-sources-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

const ICON: Readonly<Record<CortexSourceKey, LucideIcon>> = {
  projects: FolderKanban,
  issues: CircleDot,
  comments: MessageSquare,
  notes: NotebookPen,
  documents: FileText,
  connectors: Plug,
}

/**
 * Ce que Cortex sait de l'espace (R125 ; R129, séance n°19) : une ligne par source qu'il lit pour la personne, son
 * icône, son nom, son nombre et le jour de son dernier changement. Des contenus, jamais des gestes (R57). Un espace vide :
 * une ligne, et le prochain geste.
 */
export function CortexSources({ slug }: Readonly<{ slug: string }>) {
  const tp = usePreferencesStore((s) => s.t.progress)
  const sources = useCortexSourcesStore((s) => s.sources)
  const failed = useCortexSourcesStore((s) => s.failed)
  const fetchSources = useCortexSourcesStore((s) => s.fetchSources)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)

  useEffect(() => {
    if (slug) void fetchSources(slug)
  }, [slug, fetchSources])

  if (sources === null) {
    return <p className="text-xs text-muted-foreground">{failed ? tp.readFailed : tp.reading}</p>
  }
  if (sources.every((source) => source.count === 0)) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {tp.noSources}
        <Button size="sm" variant="outline" onClick={() => openCreateProject()}>{tp.createProject}</Button>
      </p>
    )
  }
  return (
    <dl className="flex flex-col">
      {sourceLines(sources, tp).map((line) => {
        const Icon = ICON[line.key] ?? FileText
        return (
          <div key={line.key} className="flex h-8 items-center gap-2 text-xs">
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <dt className="min-w-0 flex-1 truncate text-foreground">{line.label}</dt>
            <dd className="shrink-0 tabular-nums text-foreground">{line.count}</dd>
            <dd className="w-14 shrink-0 text-right text-muted-foreground">
              {line.day && (
                <Named name={line.changed}>
                  <span aria-label={line.changed ?? undefined}>{line.day}</span>
                </Named>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
