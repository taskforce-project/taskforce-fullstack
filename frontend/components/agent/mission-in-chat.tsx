"use client"

import { PaneLink } from "@/components/layout/pane-link"
import { DelegateAgentControl } from "@/components/sheets/delegate-agent-control"
import { MissionResultCard } from "@/components/sheets/mission-result-card"
import type { AssistantTarget } from "@/lib/api/assistant-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { missionPath } from "@/lib/window/address"

/**
 * La mission d'une issue, dans la conversation (TF-J1-5) : les cartes de la fiche de l'issue, telles quelles, lues dans
 * le même store. Une demande de l'agent se refuse ou s'accorde par les boutons de sa carte ; le résultat s'applique,
 * s'écarte, se relance ou se termine par ceux de la carte de résultat. La décision est toujours ce clic, jamais un « oui »
 * que la personne ou un document aurait écrit et que le modèle interpréterait (R1, ADR-024). Son nom ouvre sa vue du
 * travail dans le volet (R120).
 */
export function MissionInChat({ slug, target }: Readonly<{ slug: string; target: AssistantTarget }>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const workView = usePreferencesStore((s) => s.t.window.workView)
  const runId = useDeliveryStore((s) => target.runId ?? s.runs[target.issueId]?.id ?? null)
  const { openMission } = usePaneNavigation()
  const key = target.key ?? ""
  const label = fillText(t.missionOf, { key, title: target.title })
  return (
    <div className="my-2 flex flex-col gap-2" role="group" aria-label={label}>
      {runId === null ? (
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      ) : (
        <PaneLink
          href={missionPath(slug, runId)}
          open={() => openMission(runId)}
          title={workView}
          className="w-fit text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {label}
        </PaneLink>
      )}
      <DelegateAgentControl workspaceSlug={slug} projectId={target.projectId} issueId={target.issueId}
        goal={key ? `${target.title} (${key})` : target.title} />
      <MissionResultCard slug={slug} issueId={target.issueId} issueKey={target.key} issueTitle={target.title} responsible={null} />
    </div>
  )
}
