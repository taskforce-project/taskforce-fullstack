"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"

import { ProgressSection } from "@/components/progress/progress-section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fillModelText, proposalLines, scoreText, scoreTone } from "@/lib/ai/model-table"
import { cardLine } from "@/lib/progress/model-card"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"

const TONE = { good: "text-ink-green", bad: "text-ink-yellow", none: "text-muted-foreground" } as const

/**
 * Ce que sait faire chaque modèle, mesuré ici (R113, séance n°16 ; R125, séance n°18) : la table de l'instance, notée par
 * les cas fixes de la suite, et ce que TaskForce propose. Un modèle pas encore mesuré montre ce que dit sa fiche (sa
 * taille, sa fenêtre, ses outils), écrit comme tel, jamais une note d'éditeur. La table vit dans le volet « Progress » ;
 * le choix du modèle de Cortex reste dans Settings > AI, où mène la proposition. Rien ne change de modèle sans la personne.
 */
export function ModelCapabilityTable({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const tp = usePreferencesStore((s) => s.t.progress)
  const table = useModelCapabilityStore((s) => s.table)
  const progress = useModelCapabilityStore((s) => s.progress)
  const results = useModelCapabilityStore((s) => s.results)
  const error = useModelCapabilityStore((s) => s.error)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)
  const measure = useModelCapabilityStore((s) => s.measure)
  const measureCortexModel = useModelCapabilityStore((s) => s.measureCortexModel)
  const stop = useModelCapabilityStore((s) => s.stop)
  // Un rejeu de la banque tient déjà le modèle : une mesure attend qu'il finisse.
  const replaying = useEvalStore((s) => s.progress !== null)
  const openSettings = useSettingsStore((s) => s.openSettings)

  useEffect(() => {
    if (slug) void fetchTable(slug)
  }, [slug, fetchTable])
  // Le modèle de Cortex sans mesure complète se mesure une fois, sans clic, quand la table s'ouvre ou que le modèle de
  // Cortex change (Settings > AI). Les autres restent à la demande ; le store garde ce qu'il a déjà mesuré seul.
  useEffect(() => {
    if (slug && table) void measureCortexModel(slug)
  }, [slug, table, measureCortexModel])

  if (!table) {
    return (
      <ProgressSection title={t.title}>
        <p className="text-xs text-muted-foreground">{tp.reading}</p>
      </ProgressSection>
    )
  }
  const proposal = proposalLines(table, t)
  const caseTitle = (key: string) => table.cases.find((c) => c.key === key)?.title ?? key
  const failed = results.filter((r) => !r.passed)

  return (
    <ProgressSection title={t.title} hint={fillModelText(t.hint, { cases: table.cases.length })}>
      {table.models.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.noModels}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 border-l border-border pl-3 text-xs">
            <span className="font-medium text-foreground">{t.proposalTitle}</span>
            <span className="text-foreground">{proposal.overall}</span>
            <span className="text-muted-foreground">{proposal.each.join(" · ")}</span>
            <button
              type="button"
              onClick={() => openSettings("ai")}
              className="mt-0.5 w-fit text-left text-foreground underline-offset-4 hover:underline"
            >
              {tp.chooseModel}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{t.model}</th>
                  {table.capabilities.map((c) => (
                    <th key={c.key} className="py-1.5 pr-3 font-medium" title={c.description}>{c.label}</th>
                  ))}
                  <th className="py-1.5 pr-3 font-medium">{t.measured}</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {table.models.map((row) => {
                  const unmeasured = row.measuredAt === null
                  const card = unmeasured ? cardLine(row.card, tp) : null
                  return (
                    <tr key={row.model} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-3">
                        <span className="font-mono text-[11px] text-foreground">{row.model}</span>
                        {row.current && <Badge variant="secondary" className="ml-1.5 text-[10px]">{t.inUse}</Badge>}
                      </td>
                      {unmeasured ? (
                        // Pas encore mesuré : ce que dit sa fiche, comme telle, à la place des notes.
                        <td colSpan={table.capabilities.length} className="py-2 pr-3 text-muted-foreground">
                          {tp.notMeasuredYet}
                          {card && <span className="ml-1">{card}</span>}
                        </td>
                      ) : (
                        row.scores.map((score) => (
                          <td key={score.capability} className={cn("py-2 pr-3 tabular-nums", TONE[scoreTone(score)])}>
                            {scoreText(score, t)}
                          </td>
                        ))
                      )}
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.measuredAt
                          ? parseServerDate(row.measuredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : t.never}
                      </td>
                      <td className="py-1.5">
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" disabled={progress !== null || replaying}
                            onClick={() => void measure(slug, row.model)}>
                            {row.measuredAt ? t.measureAgain : t.measure}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {progress && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          {progress.waitSeconds !== null
            ? fillModelText(t.waiting, { seconds: progress.waitSeconds })
            : fillModelText(progress.auto ? t.autoMeasuring : t.measuring,
              { model: progress.model, done: progress.done, total: progress.total })}
          <Button size="sm" variant="ghost" onClick={stop} disabled={progress.stopping}>{t.stop}</Button>
        </div>
      )}

      {!progress && results.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span>{fillModelText(t.lastMeasure, {
            model: results[0].model ?? "", passed: results.filter((r) => r.passed).length, total: results.length,
          })}</span>
          {failed.map((r) => <span key={r.caseKey}>{fillModelText(t.caseFailed, { title: caseTitle(r.caseKey) })}</span>)}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </ProgressSection>
  )
}
