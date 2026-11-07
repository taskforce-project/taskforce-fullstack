"use client"

import { useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowUp, ChevronRight, ExternalLink, Loader2, Network } from "lucide-react"

import { UndoAction } from "@/components/agent/undo-action"
import { PANEL_ITEM, PanelRow } from "@/components/layout/panel-row"
import { WorkDot } from "@/components/layout/work-dot"
import { WorkflowCanvasDialog } from "@/components/workflows/workflow-canvas-dialog"
import { useNow } from "@/hooks/use-now"
import type { AnalysisJob } from "@/lib/api/analysis-service"
import { isUndoable } from "@/lib/api/assistant-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import { fillText, pullRequestOf, type PullRequest } from "@/lib/delivery/result-card"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { cn } from "@/lib/utils"
import { changesOf } from "@/lib/window/changes"
import {
  elapsedMinutes, isActiveJob, isActiveRun, isMine, jobState, resultsToJudge, runLabel, runState,
} from "@/lib/window/missions"
import { issuePath } from "@/lib/window/pane"

function useSlug(): string {
  const params = useParams()
  return typeof params?.workspace === "string" ? params.workspace : ""
}

/** Une mission, par sa ligne : son état en un point, son issue ; un clic ouvre l'issue dans le volet. */
function RunLine({ slug, run, aside }: Readonly<{ slug: string; run: DeliveryRun; aside?: string | null }>) {
  const inner = (
    <>
      <WorkDot state={runState(run)} />
      <span className="min-w-0 flex-1 truncate text-foreground">{runLabel(run)}</span>
      {aside && <span className="shrink-0 tabular-nums text-muted-foreground">{aside}</span>}
    </>
  )
  if (run.projectId === null) return <div className={PANEL_ITEM}>{inner}</div>
  return (
    <Link href={issuePath(slug, run.projectId, run.issueId)} className={PANEL_ITEM}>
      {inner}
    </Link>
  )
}

/** Results : les missions finies dont le résultat attend le jugement de la personne ; un clic ouvre l'issue et sa carte. */
export function ResultsRow() {
  const slug = useSlug()
  const t = usePreferencesStore((s) => s.t.window)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const me = useUserStore((s) => s.user?.id)
  const results = resultsToJudge(runs, me)

  return (
    <PanelRow row="results" value={results.length > 0 ? results.length : undefined}>
      {results.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">{t.noResults}</p>
      ) : (
        <ul className="flex flex-col">
          {results.map((run) => (
            <li key={run.id}>
              <RunLine slug={slug} run={run} />
            </li>
          ))}
        </ul>
      )}
    </PanelRow>
  )
}

/**
 * Changes : ce que la conversation a changé dans TaskForce (créé, déplacé, assigné, commenté, supprimé), avec « Undo »
 * là où la conversation l'offre déjà, et les pull requests ouvertes par ses missions.
 */
export function ChangesRow() {
  const slug = useSlug()
  const t = usePreferencesStore((s) => s.t.window)
  const turns = useCortexStore((s) => s.turns)
  const done = useCortexStore((s) => s.done)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const me = useUserStore((s) => s.user?.id)
  const changes = useMemo(() => changesOf(turns, done), [turns, done])
  // Les pull requests des missions que la conversation a confiées : celles de la personne, sur ces issues (R57).
  const pulls = useMemo(() => {
    const issues = new Set(changes.flatMap((change) => (change.kind === "delegated" && change.call.target ? [change.call.target.issueId] : [])))
    return runs
      .filter((run) => issues.has(run.issueId) && isMine(run, me))
      .map((run) => pullRequestOf(run.resultUrl))
      .filter((pull): pull is PullRequest => pull !== null)
  }, [changes, runs, me])

  return (
    <PanelRow row="changes" value={changes.length > 0 ? changes.length : undefined}>
      {changes.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">{t.noChanges}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {changes.map((change) => (
            <li key={change.id} className="px-2 py-1 text-xs">
              <p className="min-w-0 break-words text-foreground">
                <span className="text-muted-foreground">{t.changeKinds[change.kind]}</span> {change.what}
              </p>
              {isUndoable(change.call) && <UndoAction slug={slug} call={change.call} />}
            </li>
          ))}
        </ul>
      )}
      {pulls.length > 0 && (
        <ul className="mt-1 flex flex-col border-t border-border pt-1">
          {pulls.map((pull) => (
            <li key={pull.url}>
              <a href={pull.url} target="_blank" rel="noopener noreferrer" className={PANEL_ITEM}>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-foreground">{fillText(t.pullRequest, { repo: pull.repo, number: pull.number })}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </PanelRow>
  )
}

/**
 * La réponse à la question d'une analyse qui attend la personne (le dialogue de l'analyse approfondie), dans
 * « Missions » et sur le tableau de décision, où l'analyse se lance.
 */
export function AnalysisReply({ slug, job, className }: Readonly<{ slug: string; job: AnalysisJob; className?: string }>) {
  const t = usePreferencesStore((s) => s.t.window)
  const answer = useWorkflowStore((s) => s.answer)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!reply.trim() || sending) return
    setSending(true)
    setFailed(false)
    const ok = await answer(slug, job.id, reply.trim())
    setSending(false)
    if (ok) setReply("")
    else setFailed(true)
  }

  return (
    <div className={cn("flex flex-col gap-1.5 px-2 pb-1.5 pl-5.5 text-xs", className)}>
      {job.question && <p className="text-foreground">{job.question}</p>}
      <form onSubmit={(e) => void send(e)} className="flex items-center gap-1.5">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={t.reply}
          aria-label={t.reply}
          className="h-control-sm min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={!reply.trim() || sending}
          aria-label={t.sendReply}
          title={t.sendReply}
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-40"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </form>
      {failed && <p className="text-destructive">{t.replyFailed}</p>}
    </div>
  )
}

/** Une analyse, par sa ligne : son état, son projet ; un clic mène à son résultat, sur la page Analytics. */
function JobLine({ slug, job, aside }: Readonly<{ slug: string; job: AnalysisJob; aside?: string | null }>) {
  const t = usePreferencesStore((s) => s.t.window)
  return (
    <Link href={`/${slug}/analytics`} className={PANEL_ITEM}>
      <WorkDot state={jobState(job)} />
      <span className="min-w-0 flex-1 truncate text-foreground">{fillText(t.analysis, { project: job.projectName })}</span>
      {aside && <span className="shrink-0 tabular-nums text-muted-foreground">{aside}</span>}
    </Link>
  )
}

/**
 * Missions : celles qui tournent, avec leur durée, puis « Done: N », qui déplie l'historique. Les missions sont celles
 * de la personne, les analyses celles de l'espace qu'elle voit ; aucune mesure d'agent, aucun classement (R57). Une
 * mission ne s'arrête pas encore depuis l'app : pas de bouton « Stop ».
 */
export function MissionsRow() {
  const slug = useSlug()
  const t = usePreferencesStore((s) => s.t.window)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const jobs = useWorkflowStore((s) => s.jobs)
  const me = useUserStore((s) => s.user?.id)
  const now = useNow(30_000)
  const [showDone, setShowDone] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)

  const mine = runs.filter((run) => isMine(run, me))
  const runningRuns = mine.filter((run) => isActiveRun(run.status))
  const runningJobs = jobs.filter((job) => isActiveJob(job.status))
  const doneRuns = mine.filter((run) => !isActiveRun(run.status))
  const doneJobs = jobs.filter((job) => !isActiveJob(job.status))
  const running = runningRuns.length + runningJobs.length
  const doneCount = doneRuns.length + doneJobs.length

  const duration = (since: string | null | undefined): string | null => {
    const minutes = elapsedMinutes(since, now)
    if (minutes === null) return null
    return minutes < 1 ? t.underAMinute : fillText(t.minutes, { minutes })
  }

  return (
    <PanelRow row="missions" value={running > 0 ? running : undefined}>
      {running === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">{t.noMissions}</p>
      ) : (
        <ul className="flex flex-col">
          {runningRuns.map((run) => (
            <li key={`run-${run.id}`}>
              <RunLine slug={slug} run={run} aside={duration(run.claimedAt ?? run.createdAt)} />
            </li>
          ))}
          {runningJobs.map((job) => (
            <li key={`job-${job.id}`}>
              <JobLine slug={slug} job={job} aside={duration(job.createdAt)} />
              {job.status === "WAITING_FOR_INPUT" && <AnalysisReply slug={slug} job={job} />}
            </li>
          ))}
        </ul>
      )}
      {doneCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className={cn(PANEL_ITEM, "mt-1 text-muted-foreground")}
          >
            <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none", showDone && "rotate-90")} />
            {fillText(t.doneCount, { count: doneCount })}
          </button>
          {showDone && (
            <ul className="flex flex-col">
              {doneRuns.map((run) => (
                <li key={`run-${run.id}`}>
                  <RunLine slug={slug} run={run} />
                </li>
              ))}
              {doneJobs.map((job) => (
                <li key={`job-${job.id}`}>
                  <JobLine slug={slug} job={job} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" onClick={() => setCanvasOpen(true)} className={cn(PANEL_ITEM, "mt-1 text-muted-foreground")}>
        <Network className="size-4 shrink-0" />
        {t.canvas}
      </button>
      <WorkflowCanvasDialog open={canvasOpen} onOpenChange={setCanvasOpen} />
    </PanelRow>
  )
}
