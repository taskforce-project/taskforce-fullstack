"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fillModelText, proposalLines, scoreText, scoreTone } from "@/lib/ai/model-table"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"

const TONE = { good: "text-ink-green", bad: "text-ink-yellow", none: "text-muted-foreground" } as const

/**
 * Ce que sait faire chaque modèle (R113, séance n°16) : la table de l'instance, mesurée par les cas fixes de la banque,
 * ce que TaskForce propose, et le geste « Use for Cortex ». La personne choisit : dans la webapp, le modèle de Cortex
 * pour elle ({@code onUse} absent : le store le garde) ; dans l'app desktop, {@code onUse} remplit ses réglages d'IA, et
 * elle enregistre. Rien ne change de modèle sans elle.
 */
export function ModelCapabilityTable({ slug, onUse }: Readonly<{
  slug: string
  /** App desktop : le modèle choisi va dans les réglages d'IA de l'ordinateur, que la personne enregistre. */
  onUse?: (model: string) => void
}>) {
  const t = usePreferencesStore((s) => s.t.models)
  const table = useModelCapabilityStore((s) => s.table)
  const progress = useModelCapabilityStore((s) => s.progress)
  const results = useModelCapabilityStore((s) => s.results)
  const error = useModelCapabilityStore((s) => s.error)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)
  const measure = useModelCapabilityStore((s) => s.measure)
  const measureCortexModel = useModelCapabilityStore((s) => s.measureCortexModel)
  const stop = useModelCapabilityStore((s) => s.stop)
  const choose = useModelCapabilityStore((s) => s.choose)
  // La fenêtre de contexte du modèle de Cortex (le rapide), dite par l'état de l'IA quand le fournisseur est Ollama.
  const contextWindow = useAiStatusStore((s) => s.status?.fastContextWindow ?? null)
  const fetchAiStatus = useAiStatusStore((s) => s.fetchStatus)

  useEffect(() => {
    if (slug) void fetchTable(slug)
  }, [slug, fetchTable])
  useEffect(() => {
    void fetchAiStatus()
  }, [fetchAiStatus])
  // Le modèle de Cortex sans mesure complète se mesure une fois, sans clic : à l'ouverture de la table, et quand le
  // modèle de Cortex change (« Use for Cortex », ou les réglages d'IA enregistrés dans l'app desktop). Les autres
  // restent à la demande ; le store garde ce qu'il a déjà mesuré seul.
  useEffect(() => {
    if (slug && table) void measureCortexModel(slug)
  }, [slug, table, measureCortexModel])

  if (!table) {
    return <p className="text-xs text-muted-foreground">{t.title}…</p>
  }
  const proposal = proposalLines(table, t)
  const caseTitle = (key: string) => table.cases.find((c) => c.key === key)?.title ?? key
  const failed = results.filter((r) => !r.passed)

  return (
    <section className="flex flex-col gap-4" aria-label={t.title}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{fillModelText(t.hint, { cases: table.cases.length })}</p>
      </div>

      {table.models.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.noModels}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="font-medium text-foreground">{t.proposalTitle}</span>
            <span className="text-foreground">{proposal.overall}</span>
            <span className="text-muted-foreground">{proposal.each.join(" · ")}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
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
                  const inUse = row.model === table.current
                  return (
                    <tr key={row.model} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-3">
                        <span className="font-mono text-[11px] text-foreground">{row.model}</span>
                        {inUse && <Badge variant="secondary" className="ml-1.5 text-[10px]">{t.inUse}</Badge>}
                      </td>
                      {row.scores.map((score) => (
                        <td key={score.capability} className={cn("py-2 pr-3 tabular-nums", TONE[scoreTone(score)])}>
                          {scoreText(score, t)}
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.measuredAt
                          ? parseServerDate(row.measuredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : t.never}
                      </td>
                      <td className="py-1.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={progress !== null}
                            onClick={() => void measure(slug, row.model)}>
                            {row.measuredAt ? t.measureAgain : t.measure}
                          </Button>
                          {!inUse && (
                            <Button size="sm" variant="outline" title={t.useHint}
                              onClick={() => (onUse ? onUse(row.model) : void choose(slug, row.model))}>
                              {t.use}
                            </Button>
                          )}
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
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

      {!onUse && table.models.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {table.choice ? fillModelText(t.yourChoice, { model: table.choice })
            : table.instanceModel ? fillModelText(contextWindow ? t.instanceModelWindow : t.instanceModel, {
              model: table.instanceModel, tokens: contextWindow ? contextWindow.toLocaleString("en-US") : "",
            }) : null}
          {table.choice && (
            <Button size="sm" variant="ghost" onClick={() => void choose(slug, null)}>{t.useInstance}</Button>
          )}
        </div>
      )}
      {onUse && <p className="text-xs text-muted-foreground">{t.desktopUse}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  )
}
