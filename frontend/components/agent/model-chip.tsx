"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown } from "lucide-react"

import { RowMenu, RowMenuItem, RowMenuSeparator } from "@/components/agent/row-menu"
import { fillText } from "@/lib/delivery/result-card"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { withConversation } from "@/lib/window/address"
import { cortexModel } from "@/lib/window/environment"
import { progressPath } from "@/lib/window/pane"

/**
 * Le modèle qui va répondre (R134, séance n°20), dans la rangée sous la boîte ; son test : « j'arrive pas a changer de model
 * facilement », « il m affiche tjr le 8b mm si il a peut etre change comment je le sais ». Un clic ouvre la liste des modèles
 * qui savent discuter, une ligne chacun, une coche sur le modèle actuel, et le change tout de suite pour la personne : le même
 * choix que « Use for Cortex » dans Progress (R113). Au pied de la liste, ce que chacun sait faire, dans Progress.
 */
export function ModelChip({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.composer)
  const router = useRouter()
  const instance = useAiStatusStore((s) => cortexModel(s.status))
  const table = useModelCapabilityStore((s) => s.table)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)
  const chooseModel = useModelCapabilityStore((s) => s.choose)
  const setNotice = useCortexStore((s) => s.setNotice)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (slug) void fetchTable(slug)
  }, [slug, fetchTable])

  // Le modèle choisi se voit à l'instant où la personne le choisit, avant que le serveur ne réponde.
  const model = picked ?? table?.current ?? instance
  if (!model) return null
  const label = fillText(t.modelLabel, { model })

  const choose = async (next: string) => {
    if (next === table?.current) return
    setPicked(next)
    const ok = await chooseModel(slug, next === table?.instanceModel ? null : next)
    setPicked(null)
    if (!ok) {
      const why = useModelCapabilityStore.getState().error
      setNotice(why ? fillText(t.modelNotChanged, { why }) : t.modelNotChangedNoReason)
    }
  }

  const openProgress = () => {
    const progress = progressPath(slug)
    router.push(withConversation(progress, globalThis.location?.search ?? ""), { scroll: false })
  }

  return (
    <RowMenu
      label={label}
      menuLabel={t.modelMenu}
      trigger={
        <>
          <span className="min-w-0 truncate">{model}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </>
      }
    >
      {(table?.models ?? []).map((row) => (
        <RowMenuItem key={row.model} onSelect={() => void choose(row.model)}>
          <span className="min-w-0 flex-1 truncate">{row.model}</span>
          {row.model === model && <Check className="size-4 shrink-0" aria-hidden="true" />}
        </RowMenuItem>
      ))}
      {(table?.models.length ?? 0) > 0 && <RowMenuSeparator />}
      <RowMenuItem onSelect={openProgress}>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.modelProgress}</span>
      </RowMenuItem>
    </RowMenu>
  )
}
