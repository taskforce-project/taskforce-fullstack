"use client"

import { useMemo } from "react"
import { toast } from "sonner"

import { StateMark } from "@/components/workflow/state-mark"
import { useNow } from "@/hooks/use-now"
import type { AssistantTarget } from "@/lib/api/assistant-service"
import type { DeliveryRun, DeliveryRunActivity, ProjectRun } from "@/lib/api/delivery-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { missionSequence } from "@/lib/delivery/mission-sequence"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { cn } from "@/lib/utils"
import { isMine } from "@/lib/window/missions"
import { blockersOf, issueKey } from "@/lib/workflow/model"
import { nodeStateOf } from "@/lib/workflow/node-state"
import { nodeSentence, type SentenceNode } from "@/lib/workflow/sentence"

const NO_ISSUE = { assignee: null, completedAt: null, dueDate: null } as const

type SequenceTexts = (typeof CONSTANTS_EN)["missionSequence"]

/**
 * La ligne d'une mission telle que le workflow la lit, refaite de ce que la conversation connaît d'elle : son étape en cours
 * est celle que le déroulé tire de sa chronologie lue, avec les mêmes règles que le serveur (`contracts/mission-steps`).
 */
function rowOf(run: DeliveryRun, activity: DeliveryRunActivity | undefined, texts: SequenceTexts, you: boolean): ProjectRun {
  const key = missionSequence(run, activity, texts, you).steps.find((step) => step.current)?.key ?? "understand"
  const last = activity?.events.at(-1)
  return {
    run,
    step: { key, seq: last?.seq ?? null, kind: last?.kind ?? null, tool: last?.tool ?? null, at: last?.at ?? null },
    links: { branch: run.branch ?? null, pullRequestUrl: null, followUpOf: run.followUpOf ?? null, followedUpBy: null },
    approvals: (activity?.approvals ?? []).filter((approval) => approval.status === "PENDING"),
  }
}

/**
 * Le nœud d'une issue dans la conversation (séance n°25, §9) : la même carte que celle du workflow, en compact (la marque,
 * le titre et le mot de l'état ; la phrase), avec le bouton de son geste et « Open in Workflow ». Elle lit les mêmes
 * stores que la vue : elle change quand la vue change. Décider ouvre le workflow sur le nœud, où la règle se voit sur la
 * décision ; Cortex n'ouvre ni ne déplace jamais l'écran seul : la personne clique.
 */
export function NodeInChat({ slug, target, withSentence = true }: Readonly<{
  slug: string
  target: AssistantTarget
  /** La phrase du nœud ; la carte de la mission, juste dessous, la dit déjà quand elle l'accompagne. */
  withSentence?: boolean
}>) {
  const t = usePreferencesStore((s) => s.t.workflow)
  const sequence = usePreferencesStore((s) => s.t.missionSequence)
  const me = useUserStore((s) => s.user?.id ?? null)
  const now = useNow(60_000)
  const { openWorkflow, openIssue } = usePaneNavigation()
  const retryRun = useDeliveryStore((s) => s.retryRun)
  const projectRow = useDeliveryStore((s) => s.projectRuns[target.projectId]?.rows.find((row) => row.run.issueId === target.issueId))
  const run = useDeliveryStore((s) => s.runs[target.issueId] ?? null)
  const activity = useDeliveryStore((s) => (run ? s.activity[run.id] : undefined))
  const issue = useIssueStore((s) => s.workflowIssues?.issues.find((i) => i.id === target.issueId)
    ?? s.issues.find((i) => i.id === target.issueId) ?? null)
  // Les liens du projet, quand la vue ou le tableau les a lus : la carte dit « Blocked » comme la carte du projet.
  const relations = useIssueStore((s) => s.projectRelations[target.projectId]?.relations)
  const workflowIssues = useIssueStore((s) => s.workflowIssues)
  const blockers = useMemo(() => {
    if (!relations) return []
    const known = new Map((workflowIssues?.issues ?? []).map((i) => [i.id, i.status.category] as const))
    return blockersOf(target.issueId, relations, (summary) => known.get(summary.id) ?? summary.status?.category)
  }, [relations, workflowIssues, target.issueId])

  const node = useMemo(() => {
    // La ligne du projet porte ce que la personne peut décider ; sinon, la mission de l'issue et sa chronologie lue.
    const row = projectRow && (!run || projectRow.run.id >= run.id) ? projectRow : run ? rowOf(run, activity, sequence, isMine(run, me)) : null
    // Sans l'issue, sa colonne ne se devine pas : la mission seule dit où elle en est.
    const { state, reason } = nodeStateOf({ category: issue?.status.category ?? null, run: row, blockers, me })
    const sentenceNode: SentenceNode = { reason, run: row, overdue: false, issue: issue ?? NO_ISSUE }
    return { state, reason, row, sentenceNode }
  }, [projectRow, run, activity, sequence, issue, blockers, me])

  const sentence = nodeSentence(node.sentenceNode, { workflow: t, sequence }, { me, now: new Date(now) })
  const word = t.state[node.state]
  const nodeId = issueKey(target.issueId)
  const mission = node.row?.run ?? null
  const canRetry = node.state === "failed" && mission !== null && isMine(mission, me)

  async function retry() {
    if (!mission) return
    const next = await retryRun(slug, mission.issueId, mission.id, "")
    if (next) toast.success(t.gesture.retried)
    else toast.error(t.gesture.retryFailed)
  }

  return (
    <div className="flex flex-col gap-1 border border-border bg-card px-3 py-2" role="group" aria-label={`${target.title}, ${word}`}>
      <div className="flex min-w-0 items-center gap-2">
        <StateMark state={node.state} word={word} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-[450] text-foreground" title={target.title}>{target.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{word}</span>
      </div>
      {withSentence && sentence && <p className="line-clamp-2 pl-6 text-xs text-muted-foreground">{sentence}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => openWorkflow(target.projectId, nodeId)}
          className="flex h-7 items-center px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          {t.openInWorkflow}
        </button>
        {node.reason.kind === "approval" && (
          <ChatButton onClick={() => openWorkflow(target.projectId, nodeId)}>{t.action.decide}</ChatButton>
        )}
        {node.reason.kind === "review" && (
          <ChatButton onClick={() => openIssue({ projectId: target.projectId, issueId: target.issueId })}>{t.action.review}</ChatButton>
        )}
        {canRetry && <ChatButton onClick={() => void retry()}>{t.gesture.retry}</ChatButton>}
      </div>
    </div>
  )
}

function ChatButton({ onClick, children }: Readonly<{ onClick: () => void; children: string }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex h-7 items-center bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover motion-reduce:transition-none")}
    >
      {children}
    </button>
  )
}
