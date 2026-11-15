"use client"

import { useSearchParams } from "next/navigation"

import { DensitySwitch, FilterMenu, LiveIndicator } from "@/components/workflow/workflow-controls"
import { useMinWidth } from "@/hooks/use-min-width"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkflowViewStore } from "@/lib/store/workflow-view-store"
import { replaceQuery } from "@/lib/window/address"
import { isDensity, isFilter, type Density, type WorkflowFilter } from "@/lib/workflow/states"

/**
 * Ce que le workflow met dans la ligne du titre de son volet (séance n°25, §3), à droite des onglets : l'indicateur du
 * direct, le sélecteur de densité (sur un écran large) et « Filter ». « Legend » est dans le menu « ... » du projet.
 */
export function WorkflowTitleControls({ projectId }: Readonly<{ projectId: number }>) {
  const search = useSearchParams()
  const person = useUserStore((s) => (s.user?.id != null ? String(s.user.id) : "anonymous"))
  const live = useWorkflowViewStore((s) => (s.live?.projectId === projectId ? s.live : null))
  const remembered = useWorkflowViewStore((s) => s.densities[person])
  const setDensity = useWorkflowViewStore((s) => s.setDensity)
  const wide = useMinWidth(768)
  const view = search.get("view")
  const filterParam = search.get("filter")
  const density: Density = isDensity(view) ? view : (remembered ?? "plan")
  const filter: WorkflowFilter | null = isFilter(filterParam) ? filterParam : null

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {live && <LiveIndicator state={live.state} readAt={live.readAt} />}
      {wide && (
        <DensitySwitch
          value={density}
          onChange={(next) => {
            setDensity(person, next)
            replaceQuery({ view: next === "plan" ? null : next })
          }}
        />
      )}
      <FilterMenu value={filter} onChange={(next) => replaceQuery({ filter: next })} />
    </div>
  )
}
