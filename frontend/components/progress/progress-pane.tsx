"use client"

import { useParams } from "next/navigation"

import { BankHistory } from "@/components/progress/bank-history"
import { CortexSources } from "@/components/progress/cortex-sources"
import { Improvements } from "@/components/progress/improvements"
import { ModelCapabilityTable } from "@/components/progress/model-capability-table"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Le volet « Progress » (R125, séance n°18) : ce que l'agent sait, et comment il progresse, mesuré ici.
 *
 * <ol>
 *   <li>Ce que chaque modèle sait faire (R113) : la table des capacités, et la fiche d'un modèle pas encore mesuré.</li>
 *   <li>Comment il fait dans le temps (R61, R118) : la banque d'évaluations par modèle et par date, et sa courbe.</li>
 *   <li>Ce qui l'a amélioré (E17) : chaque cas ajouté par « Add to test bank », d'où il vient, et sa note depuis.</li>
 *   <li>Ce qu'il sait de l'espace : ses sources, comptées et datées.</li>
 * </ol>
 *
 * Ce n'est pas un écran de surveillance (R57) : rien de l'activité de l'agent, aucun classement.
 */
export function ProgressPane() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const intro = usePreferencesStore((s) => s.t.progress.intro)
  if (!slug) return null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <p className="text-xs text-muted-foreground">{intro}</p>
      <ModelCapabilityTable slug={slug} />
      <BankHistory slug={slug} />
      <Improvements />
      <CortexSources slug={slug} />
    </div>
  )
}
