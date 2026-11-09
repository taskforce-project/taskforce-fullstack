"use client"

import { useEffect, type ComponentType } from "react"
import { useParams } from "next/navigation"

import { BankHistory } from "@/components/progress/bank-history"
import { CortexSources } from "@/components/progress/cortex-sources"
import { Improvements } from "@/components/progress/improvements"
import { ModelBenchmark } from "@/components/progress/model-benchmark"
import { ModelRuns } from "@/components/progress/model-runs"
import { Named } from "@/components/progress/named"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelBenchmarkStore } from "@/lib/store/model-benchmark-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"

type ProgressTab = keyof (typeof CONSTANTS_EN)["progress"]["tabs"]

/** La personne, telle que le volet retient son onglet. */
function usePerson(): string {
  const me = useUserStore((s) => s.user?.id)
  return me === null || me === undefined ? "" : String(me)
}

/**
 * Ce qui s'est passé jusqu'ici (R142, s29) : les passages des modèles, puis la courbe de la banque de tests et ce qui l'a
 * amélioré, qui se lisent ensemble. Rien du tout : une ligne, et le geste qui remplit l'onglet.
 */
function History({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.benchmark)
  const person = usePerson()
  const runs = useModelBenchmarkStore((s) => s.history)
  const bank = useEvalStore((s) => s.history)
  const fetchRuns = useModelBenchmarkStore((s) => s.fetchHistory)
  const setPickerOpen = useModelBenchmarkStore((s) => s.setPickerOpen)
  const setProgressTab = useWindowStore((s) => s.setProgressTab)

  useEffect(() => {
    if (slug) void fetchRuns(slug)
  }, [slug, fetchRuns])

  if (runs !== null && runs.length === 0 && bank !== null && bank.cases.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">{t.historyEmpty}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setProgressTab(person, "models")
            setPickerOpen(true)
          }}
        >
          {t.historyGo}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <ModelRuns />
      <BankHistory slug={slug} />
      <Improvements slug={slug} />
    </div>
  )
}

/** Les onglets, dans leur ordre : un de plus, c'est une ligne ici et son mot dans `progress.tabs` (`constants_en.ts`). */
const TABS: readonly { readonly key: ProgressTab; readonly Panel: ComponentType<Readonly<{ slug: string }>> }[] = [
  { key: "models", Panel: ModelBenchmark },
  { key: "history", Panel: History },
  { key: "sources", Panel: CortexSources },
]

/**
 * Le volet « Progress » (R125, séance n°18 ; R130, séance n°19 ; R142, séance n°20) : ce que l'agent sait, et comment il progresse,
 * mesuré ici. Un contrôle segmenté en haut, un mot par onglet, une question chacun ; l'onglet se retient pour chaque personne.
 * Ce n'est pas un écran de surveillance (R57) : rien de l'activité de l'agent, aucun classement.
 */
export function ProgressPane() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const tabs = usePreferencesStore((s) => s.t.progress.tabs)
  const person = usePerson()
  const remembered = useWindowStore((s) => s.progressTabs[person])
  const setProgressTab = useWindowStore((s) => s.setProgressTab)

  if (!slug) return null
  const active = TABS.find((tab) => tab.key === remembered)?.key ?? TABS[0].key

  return (
    <Tabs value={active} onValueChange={(tab) => setProgressTab(person, tab)} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <TabsList>
        {TABS.map(({ key }) => (
          // Le survol passe par un `span` : la bulle ne doit pas remplacer l'état de l'onglet (`data-state`).
          <Named key={key} name={tabs[key].hint} wide>
            <span className="inline-flex h-full">
              <TabsTrigger value={key} aria-description={tabs[key].hint}>{tabs[key].label}</TabsTrigger>
            </span>
          </Named>
        ))}
      </TabsList>
      {TABS.map(({ key, Panel }) => (
        <TabsContent key={key} value={key}>
          <Panel slug={slug} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
