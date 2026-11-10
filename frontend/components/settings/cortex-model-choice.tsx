"use client"

import { useEffect } from "react"

import { ProgressLink } from "@/components/progress/progress-link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fillModelText, proposalLines } from "@/lib/ai/model-table"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/** Valeur de la liste pour « le modèle de l'instance » (un élément de liste ne peut pas être vide). */
const INSTANCE = "__instance"

/**
 * Le modèle de Cortex pour la personne, dans Settings > AI de la webapp (R113 ; R125, séance n°18) : elle le choisit
 * parmi ceux que l'instance sert, ou garde celui de l'instance. TaskForce propose le premier modèle capable d'après ce
 * qu'il a mesuré ici ; ce que chacun sait faire se lit dans le volet « Progress », où la table a déménagé. Rien ne
 * change de modèle sans elle.
 */
export function CortexModelChoice({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const tp = usePreferencesStore((s) => s.t.progress)
  const table = useModelCapabilityStore((s) => s.table)
  const error = useModelCapabilityStore((s) => s.error)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)
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

  if (!table) return <p className="text-xs text-muted-foreground">{tp.reading}</p>

  // Le modèle de l'instance se suit sans être épinglé : il revient à « null » (le choix de la personne effacé).
  const others = table.models.filter((row) => row.model !== table.instanceModel)
  const value = table.choice && table.choice !== table.instanceModel ? table.choice : INSTANCE

  return (
    <section aria-label={tp.choiceLabel} className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{tp.choiceLabel}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{tp.choiceHint}</p>
      </div>
      {table.models.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.noModels}</p>
      ) : (
        <>
          <Select value={value} onValueChange={(next) => void choose(slug, next === INSTANCE ? null : next)}>
            <SelectTrigger className="w-full max-w-sm" aria-label={tp.choiceLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {table.instanceModel && (
                <SelectItem value={INSTANCE}>{fillModelText(tp.instanceChoice, { model: table.instanceModel })}</SelectItem>
              )}
              {others.map((row) => (
                <SelectItem key={row.model} value={row.model}>{row.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {table.choice
              ? fillModelText(t.yourChoice, { model: table.choice })
              : table.instanceModel
                ? fillModelText(contextWindow ? t.instanceModelWindow : t.instanceModel, {
                  model: table.instanceModel, tokens: contextWindow ? contextWindow.toLocaleString("en-US") : "",
                })
                : null}
          </p>
        </>
      )}
      <ModelProposal />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  )
}

/**
 * Ce que TaskForce propose d'après ce qu'il a mesuré ici (R113), et le lien vers le volet « Progress » : sous le choix du
 * modèle, dans la webapp comme dans l'app desktop. Il lit la table que charge l'écran qui le montre.
 */
export function ModelProposal() {
  const t = usePreferencesStore((s) => s.t.models)
  const table = useModelCapabilityStore((s) => s.table)
  const proposal = table && table.models.length > 0 ? proposalLines(table, t) : null
  return (
    <div className="flex flex-col gap-2">
      {proposal && (
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-foreground">{t.proposalTitle}</span>
          <span className="text-foreground">{proposal.overall}</span>
        </div>
      )}
      <ProgressLink />
    </div>
  )
}
