"use client"

import type { ComponentType } from "react"
import { useParams } from "next/navigation"

import { BankHistory } from "@/components/progress/bank-history"
import { CortexSources } from "@/components/progress/cortex-sources"
import { Improvements } from "@/components/progress/improvements"
import { ModelBenchmark } from "@/components/progress/model-benchmark"
import { ModelCapabilityTable } from "@/components/progress/model-capability-table"
import { Named } from "@/components/progress/named"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"

type ProgressTab = keyof (typeof CONSTANTS_EN)["progress"]["tabs"]

/** La courbe de la banque et ce qui l'a amélioré : les deux se lisent ensemble. */
function History({ slug }: Readonly<{ slug: string }>) {
  return (
    <div className="flex flex-col gap-4">
      <BankHistory slug={slug} />
      <Improvements />
    </div>
  )
}

/** Les onglets, dans leur ordre : un de plus, c'est une ligne ici et son mot dans `progress.tabs` (`constants_en.ts`). */
const TABS: readonly { readonly key: ProgressTab; readonly Panel: ComponentType<Readonly<{ slug: string }>> }[] = [
  { key: "models", Panel: ModelCapabilityTable },
  { key: "benchmark", Panel: ModelBenchmark },
  { key: "history", Panel: History },
  { key: "sources", Panel: CortexSources },
]

/**
 * Le volet « Progress » (R125, séance n°18 ; R130, séance n°19) : ce que l'agent sait, et comment il progresse, mesuré ici.
 * Un contrôle segmenté en haut, un mot par onglet, une question chacun ; l'onglet se retient pour chaque personne. Ce n'est
 * pas un écran de surveillance (R57) : rien de l'activité de l'agent, aucun classement.
 */
export function ProgressPane() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const tabs = usePreferencesStore((s) => s.t.progress.tabs)
  const me = useUserStore((s) => s.user?.id)
  const person = me === null || me === undefined ? "" : String(me)
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
