"use client"

import { DelegateAgentControl } from "@/components/sheets/delegate-agent-control"
import { MissionResultCard } from "@/components/sheets/mission-result-card"
import type { AssistantTarget } from "@/lib/api/assistant-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * La mission d'une issue, dans la conversation (TF-J1-5) : les cartes de la fiche de l'issue, telles quelles, lues dans
 * le même store. Une demande de l'agent se refuse ou s'accorde par les boutons de sa carte ; le résultat s'applique,
 * s'écarte, se relance ou se termine par ceux de la carte de résultat. La décision est toujours ce clic, jamais un « oui »
 * que la personne ou un document aurait écrit et que le modèle interpréterait (R1, ADR-024).
 */
export function MissionInChat({ slug, target }: Readonly<{ slug: string; target: AssistantTarget }>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const key = target.key ?? ""
  return (
    <div className="my-2 flex flex-col gap-2" role="group" aria-label={fillText(t.missionOf, { key, title: target.title })}>
      <p className="text-[11px] font-medium text-muted-foreground">{fillText(t.missionOf, { key, title: target.title })}</p>
      <DelegateAgentControl workspaceSlug={slug} projectId={target.projectId} issueId={target.issueId}
        goal={key ? `${target.title} (${key})` : target.title} />
      <MissionResultCard slug={slug} issueId={target.issueId} issueKey={target.key} issueTitle={target.title} responsible={null} />
    </div>
  )
}
