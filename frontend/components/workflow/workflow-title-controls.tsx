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
 * direct, le sélecteur de densité (sur un écran large) et « Filter ». « Legend » est dans le menu « ... » du projet. Quand la
 * vue est étroite, ils passent dans la ligne de son en-tête (`inHeader`), et la ligne des onglets ne les montre plus.
 * « Show all links » vit dans l'en-tête de la vue, à toutes les largeurs : dans la ligne des onglets, il poussait « Settings »
 * hors d'elle à 1440 px (R161, N9).
 */
export function WorkflowTitleControls({ projectId, inHeader = false, densities }: Readonly<{
  projectId: number
  /** Rendus dans l'en-tête de la vue, et non dans la ligne des onglets. */
  inHeader?: boolean
  /** Le sélecteur de densité se montre ; par défaut, sur une fenêtre large. La vue le dit sur sa propre largeur. */
  densities?: boolean
}>) {
  const search = useSearchParams()
  const person = useUserStore((s) => (s.user?.id != null ? String(s.user.id) : "anonymous"))
  const live = useWorkflowViewStore((s) => (s.live?.projectId === projectId ? s.live : null))
  const remembered = useWorkflowViewStore((s) => s.densities[person])
  const setDensity = useWorkflowViewStore((s) => s.setDensity)
  const wide = useMinWidth(768)
  const moved = useWorkflowViewStore((s) => s.controlsInView)
  const view = search.get("view")
  const filterParam = search.get("filter")
  const density: Density = isDensity(view) ? view : (remembered ?? "plan")
  const filter: WorkflowFilter | null = isFilter(filterParam) ? filterParam : null

  if (moved && !inHeader) return null
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {live && <LiveIndicator state={live.state} readAt={live.readAt} />}
      {(densities ?? wide) && (
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
