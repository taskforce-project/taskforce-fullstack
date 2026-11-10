"use client"

import { useEffect, useMemo, useState } from "react"
import { ExternalLink, FilePen, FilePlus2, MessageSquareText } from "lucide-react"

import type { DeliveryRun, DeliveryRunEvent } from "@/lib/api/delivery-service"
import { fillText, pullRequestOf } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { diffAnchor, documentChanges, fileChanges, type DocumentGesture } from "@/lib/window/work-view"

/** Les ancres des fichiers dans la pull request, calculées une fois par chemin. */
function useDiffAnchors(paths: readonly string[]): Readonly<Record<string, string>> {
  const [anchors, setAnchors] = useState<Readonly<Record<string, string>>>({})
  const wanted = paths.join("\n")
  useEffect(() => {
    let live = true
    const list = wanted ? wanted.split("\n") : []
    void Promise.all(list.map(async (path) => [path, await diffAnchor(path)] as const)).then((pairs) => {
      if (!live) return
      setAnchors(Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair[1] !== null)))
    })
    return () => { live = false }
  }, [wanted])
  return anchors
}

/**
 * Les fichiers et les documents d'une mission d'après sa chronologie, sous `<MissionChanges run={run} />` (R139). Une ligne
 * par fichier ; les commentaires, comptés. Une mission que le runner relève n'y garde que ses documents : ses fichiers sont
 * déjà au-dessus, avec leurs lignes (`documentsOnly`). Rien tant qu'il n'y a rien.
 */
export function MissionFiles({ run, events, documentsOnly = false }: Readonly<{
  run: Pick<DeliveryRun, "resultUrl">
  events: readonly DeliveryRunEvent[]
  documentsOnly?: boolean
}>) {
  const t = usePreferencesStore((s) => s.t.workView)
  const files = useMemo(() => (documentsOnly ? [] : fileChanges(events)), [events, documentsOnly])
  const documents = useMemo(() => {
    const counted = new Map<DocumentGesture, number>()
    for (const document of documentChanges(events)) counted.set(document.gesture, (counted.get(document.gesture) ?? 0) + 1)
    return [...counted]
  }, [events])
  const anchors = useDiffAnchors(files.map((file) => file.path))
  const pull = pullRequestOf(run.resultUrl)
  if (files.length === 0 && documents.length === 0) return null

  return (
    <section aria-label={t.files} className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
        {t.files}
        <span className="tabular-nums">{files.length + documents.reduce((sum, [, count]) => sum + count, 0)}</span>
      </h3>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {files.map((file) => {
          const anchor = anchors[file.path]
          const diff = pull ? `${pull.url}/files${anchor ? `#${anchor}` : ""}` : null
          return (
            <li key={file.path} className="flex h-9 items-center gap-2 px-2 text-xs">
              {file.kind === "written"
                ? <FilePlus2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                : <FilePen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate text-foreground" title={file.path}>{file.path}</span>
              <span className="shrink-0 text-muted-foreground">
                {file.kind === "written" ? t.written : t.edited}
                {file.times > 1 && ` · ${fillText(t.times, { count: file.times })}`}
              </span>
              {diff && (
                <a href={diff} target="_blank" rel="noopener noreferrer" title={t.diffHint}
                  className="flex shrink-0 items-center gap-1 text-foreground underline-offset-2 hover:underline">
                  {t.diff} <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </li>
          )
        })}
        {documents.map(([gesture, count]) => (
          <li key={gesture} className="flex h-9 items-center gap-2 px-2 text-xs">
            <MessageSquareText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-foreground">{t.documents[gesture]}</span>
            {count > 1 && <span className="shrink-0 tabular-nums text-muted-foreground">{fillText(t.times, { count })}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
