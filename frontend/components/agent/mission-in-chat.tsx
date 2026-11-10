"use client"

import { PaneLink } from "@/components/layout/pane-link"
import { DelegateAgentControl } from "@/components/sheets/delegate-agent-control"
import type { AssistantTarget } from "@/lib/api/assistant-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { missionPath } from "@/lib/window/address"

/**
 * La mission d'une issue, dans la conversation (TF-J1-5, R138) : la même chose que sa vue du travail, en plus petit. Son nom,
 * la phrase qui dit où elle en est, l'étape en cours, et de quoi ouvrir la vue : la conversation ne la remplace pas (s10 de la
 * recette 1.13 : « que la personne voit le workflow »). Une demande de l'agent se refuse ou s'accorde ici, par ses boutons :
 * la décision est toujours ce clic, jamais un « oui » que la personne ou un document aurait écrit et que le modèle
 * interpréterait (R1, ADR-024). Le résultat se relit dans la vue.
 */
export function MissionInChat({ slug, target }: Readonly<{ slug: string; target: AssistantTarget }>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const workView = usePreferencesStore((s) => s.t.window.workView)
  const runId = useDeliveryStore((s) => target.runId ?? s.runs[target.issueId]?.id ?? null)
  const { openMission } = usePaneNavigation()
  const key = target.key ?? ""
  const label = fillText(t.missionOf, { key, title: target.title })
  return (
    <div className="my-2 flex flex-col gap-1.5" role="group" aria-label={label}>
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
    </div>
  )
}
