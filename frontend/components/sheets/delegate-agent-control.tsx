"use client"

import { useEffect } from "react"
import { Activity } from "lucide-react"

import { MissionStepIcon } from "@/components/delivery/mission-steps"
import { PaneLink } from "@/components/layout/pane-link"
import { WorkDot } from "@/components/layout/work-dot"
import { PendingApproval } from "@/components/sheets/pending-approval"
import { missionSequence } from "@/lib/delivery/mission-sequence"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { missionPath } from "@/lib/window/address"
import { isMine, runState } from "@/lib/window/missions"

/**
 * Une mission en petit, sur l'issue et dans la conversation (R138, TF-J1-16) : la phrase qui dit où elle en est, les cinq
 * étapes en cinq points, celle en cours, et de quoi ouvrir sa vue du travail. Rien tant qu'aucune délégation ; ce qui attend
 * la personne se répond ici, là où elle regarde (R133). Le déroulé se lit dans la vue : ceci ne le remplace pas (s10). La
 * délégation elle-même se déclenche depuis le menu Assignee ; la décision d'accepter le résultat reste humaine.
 */
export function DelegateAgentControl({
  workspaceSlug,
  issueId,
  goal,
}: Readonly<{ workspaceSlug: string; projectId: number; issueId: number; goal?: string }>) {
  const texts = usePreferencesStore((s) => s.t.missionSequence)
  const workView = usePreferencesStore((s) => s.t.window.workView)
  const { openMission } = usePaneNavigation()
  const run = useDeliveryStore((s) => s.runs[issueId])
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const activity = useDeliveryStore((s) => (run ? s.activity[run.id] : undefined))
  const fetchActivity = useDeliveryStore((s) => s.fetchActivity)
  const viewerId = useUserStore((s) => s.user?.id)

  useEffect(() => {
    fetchRun(workspaceSlug, issueId)
  }, [workspaceSlug, issueId, fetchRun])

  const active = run?.status === "QUEUED" || run?.status === "RUNNING"
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { fetchRun(workspaceSlug, issueId) }, 1500)
    return () => clearInterval(id)
  }, [active, workspaceSlug, issueId, fetchRun])

  // Chronologie : lue en continu pendant le run, une dernière fois à sa fin (les derniers événements arrivent
  // avec le résultat).
  const runId = run?.id
  const running = run?.status === "RUNNING"
  useEffect(() => {
    if (!runId) return
    fetchActivity(workspaceSlug, runId)
    if (!running) return
    const id = setInterval(() => { fetchActivity(workspaceSlug, runId) }, 2000)
    return () => clearInterval(id)
  }, [runId, running, workspaceSlug, fetchActivity])

  if (!run) return null

  const you = isMine(run, viewerId)
  const sequence = missionSequence(run, activity, texts, you)
  const current = sequence.steps.find((step) => step.current)
  const pending = running ? (activity?.approvals ?? []).filter((approval) => approval.status === "PENDING") : []

  return (
    <div className="flex flex-col gap-1.5 border border-border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2 text-foreground">
          <WorkDot state={runState(run)} />
          <span className="min-w-0 break-words">{sequence.status}</span>
        </span>
        {/* Le pouls de la mission mène à sa vue du travail, dans le volet (R95, point 3). */}
        <PaneLink
          href={missionPath(workspaceSlug, run.id)}
          open={() => openMission(run.id)}
          className="flex shrink-0 items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <Activity className="size-3.5" aria-hidden="true" /> {workView}
        </PaneLink>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className="flex shrink-0 items-center gap-0.5">
          {sequence.steps.map((step) => (
            <MissionStepIcon key={step.key} state={step.state} label={`${step.name}: ${texts.states[step.state]}`} className="size-3.5" />
          ))}
        </span>
        {current && current.state !== "not-started" && (
          <span className="min-w-0 truncate" title={current.sentence}>{current.name}: {current.sentence}</span>
        )}
      </div>
      {pending.map((approval) => (
        <PendingApproval key={approval.id} slug={workspaceSlug} runId={run.id} approval={approval} goal={goal} run={run} compact />
      ))}
    </div>
  )
}
