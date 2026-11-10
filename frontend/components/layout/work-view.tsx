"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ChevronRight, ExternalLink, FileCheck2, Loader2, ShieldCheck, Square } from "lucide-react"
import { toast } from "sonner"

import { MissionChanges } from "@/components/delivery/mission-changes"
import { MissionFiles } from "@/components/delivery/mission-files"
import { MissionDetailLine, MissionSteps } from "@/components/delivery/mission-steps"
import { PaneLink } from "@/components/layout/pane-link"
import { WorkDot } from "@/components/layout/work-dot"
import { MissionResultCard } from "@/components/sheets/mission-result-card"
import { PendingApproval } from "@/components/sheets/pending-approval"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { Switch } from "@/components/ui/switch"
import { useNow } from "@/hooks/use-now"
import type { DeliveryRun, DeliveryRunApproval, DeliveryRunEvent } from "@/lib/api/delivery-service"
import { approvalLine, approvalsSentence, missionModel, missionSequence } from "@/lib/delivery/mission-sequence"
import { agentWords, fillText, missionAgentName, pullRequestOf, workMinutes } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { cn } from "@/lib/utils"
import { elapsedMinutes, isActiveRun, isMine, runState } from "@/lib/window/missions"
import { issuePath } from "@/lib/window/pane"
import { proofOf } from "@/lib/window/work-view"

/** Le rythme des relectures pendant que la mission tourne : son état et sa chronologie, puis son dossier. */
const RUN_MS = 2_000
const PROOF_MS = 5_000

const NO_EVENTS: readonly DeliveryRunEvent[] = []
const NO_APPROVALS: readonly DeliveryRunApproval[] = []

/** Copilot travaille sur GitHub : TaskForce ne sait pas l'y arrêter, le bouton n'existe pas pour lui (R15). */
const CANNOT_STOP = "github-copilot"

/** « Stop » : une question, parce qu'une mission arrêtée ne reprend pas ; la dialogue a une colonne et une action (R133). */
function StopMission({ slug, run, agent }: Readonly<{ slug: string; run: DeliveryRun; agent: string }>) {
  const t = usePreferencesStore((s) => s.t.missionSequence.stop)
  const stopRun = useDeliveryStore((s) => s.stopRun)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  async function stop() {
    setBusy(true)
    const ok = await stopRun(slug, run.issueId, run.id)
    setBusy(false)
    setAsking(false)
    if (ok) toast.success(t.done)
    else toast.error(t.failed)
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-xs" title={t.hint} onClick={() => setAsking(true)}>
        <Square className="size-3" aria-hidden="true" /> {t.action}
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.title}</AlertDialogTitle>
            <AlertDialogDescription>{fillText(t.body, { agent })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t.keep}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void stop() }}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Les accords : une phrase, le détail d'un clic, la commande derrière l'interrupteur (R133). */
function ApprovalsRow({ run, approvals, you, showCommands }: Readonly<{
  run: DeliveryRun
  approvals: readonly DeliveryRunApproval[]
  you: boolean
  showCommands: boolean
}>) {
  const name = usePreferencesStore((s) => s.t.workView.approvals)
  const sequence = usePreferencesStore((s) => s.t.missionSequence)
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${name}: ${approvalsSentence(approvals, sequence, you)}`}
        onClick={() => setOpen((was) => !was)}
        className="flex h-9 w-full items-center gap-2.5 px-2 text-left text-xs transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
      >
        <span role="img" aria-label={name} title={name} className="inline-flex shrink-0">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">{approvalsSentence(approvals, sequence, you)}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
        />
      </button>
      {open && (
        <ol className="flex flex-col pb-2.5 pl-[34px] pr-2">
          {approvals.map((approval) => (
            <MissionDetailLine key={approval.id} line={approvalLine(approval, run, sequence, you)} showCommands={showCommands} />
          ))}
        </ol>
      )}
    </div>
  )
}

/** La preuve, repliée en une ligne (R138) : le nombre d'événements, scellés, et le téléchargement du dossier. */
function ProofRow({ slug, runId, count, sealed }: Readonly<{ slug: string; runId: number; count: number; sealed: boolean }>) {
  const t = usePreferencesStore((s) => s.t.missionSequence.proof)
  const downloadEvidence = useDeliveryStore((s) => s.downloadEvidence)
  const said = count === 0 ? t.none
    : sealed ? (count === 1 ? t.sealedOne : fillText(t.sealed, { count }))
    : (count === 1 ? t.buildingOne : fillText(t.building, { count }))

  async function download(format: "json" | "md") {
    if (!(await downloadEvidence(slug, runId, format))) toast.error(t.failed)
  }

  return (
    <p className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-1 text-xs text-muted-foreground" title={t.hint}>
      <span role="img" aria-label={t.name} title={t.name} className="inline-flex shrink-0">
        <FileCheck2 className="size-4" aria-hidden="true" />
      </span>
      <span className="tabular-nums text-foreground">{said}</span>
      {count > 0 && (
        <span className="ml-auto flex items-center gap-1.5">
          {t.download}
          <button type="button" className="text-foreground underline-offset-2 hover:underline" onClick={() => void download("json")}>JSON</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="text-foreground underline-offset-2 hover:underline" onClick={() => void download("md")}>Markdown</button>
        </span>
      )}
    </p>
  )
}

/**
 * La vue du travail d'une mission (R95, point 3 ; R138, séance n°20) : un volet pour une mission, en direct. Un en-tête dit
 * où elle en est en une phrase ; cinq étapes, toujours les mêmes, racontent ce que l'agent fait ; les accords et la preuve
 * se replient en une ligne chacun, et les commandes reviennent d'un interrupteur. Puis le résultat, quand l'agent le rend.
 * Rien n'y juge ni ne classe l'agent (R57). Elle se lit dans ce que TaskForce a déjà : la mission, sa chronologie, son dossier.
 */
export function WorkView({ runId }: Readonly<{ runId: number }>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.workView)
  const missions = usePreferencesStore((s) => s.t.missions)
  const sequenceTexts = usePreferencesStore((s) => s.t.missionSequence)
  const listed = useDeliveryStore((s) => s.workspaceRuns.find((r) => r.id === runId))
  const latest = useDeliveryStore((s) => (listed ? s.runs[listed.issueId] : undefined))
  const activity = useDeliveryStore((s) => s.activity[runId])
  const evidence = useDeliveryStore((s) => s.evidence[runId])
  // Le runner relève les changements (R139) : la liste d'après la chronologie ne sert plus qu'aux missions d'avant.
  const tracked = useDeliveryStore((s) => Boolean(s.missionChanges[runId]?.mode))
  const fetchWorkspaceRuns = useDeliveryStore((s) => s.fetchWorkspaceRuns)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const fetchActivity = useDeliveryStore((s) => s.fetchActivity)
  const fetchEvidence = useDeliveryStore((s) => s.fetchEvidence)
  const viewerId = useUserStore((s) => s.user?.id)
  const { openIssue } = usePaneNavigation()
  const now = useNow(30_000)
  const [checked, setChecked] = useState(false)
  const [showCommands, setShowCommands] = useState(false)

  // La mission la plus fraîche : celle de son issue quand c'est elle, sinon celle de la liste de l'espace.
  const run: DeliveryRun | undefined = latest?.id === runId ? latest : listed
  const issueId = run?.issueId ?? null
  const active = run ? isActiveRun(run.status) : false
  const running = run?.status === "RUNNING"
  const known = run !== undefined

  // Une mission que la liste de l'espace n'a pas encore : elle se relit une fois, puis la vue dit qu'elle ne la trouve pas.
  useEffect(() => {
    if (!slug || listed) return
    let live = true
    void fetchWorkspaceRuns(slug).then(() => { if (live) setChecked(true) })
    return () => { live = false }
  }, [slug, listed, fetchWorkspaceRuns])

  // Son état avance quand on la lit (le serveur relance un runner perdu) : relue pendant qu'elle tourne.
  useEffect(() => {
    if (!slug || issueId === null) return
    void fetchRun(slug, issueId)
    if (!active) return
    const id = setInterval(() => { void fetchRun(slug, issueId) }, RUN_MS)
    return () => clearInterval(id)
  }, [slug, issueId, active, fetchRun])

  // Sa chronologie et ses demandes : en continu pendant le travail, une dernière fois à la fin.
  useEffect(() => {
    if (!slug || !known) return
    void fetchActivity(slug, runId)
    if (!running) return
    const id = setInterval(() => { void fetchActivity(slug, runId) }, RUN_MS)
    return () => clearInterval(id)
  }, [slug, runId, running, known, fetchActivity])

  // La preuve, qui se construit avec la mission ; scellée à sa fin.
  useEffect(() => {
    if (!slug || !known) return
    void fetchEvidence(slug, runId)
    if (!active) return
    const id = setInterval(() => { void fetchEvidence(slug, runId) }, PROOF_MS)
    return () => clearInterval(id)
  }, [slug, runId, active, known, fetchEvidence])

  if (!run) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        {checked ? t.notFound : <><Loader2 className="size-4 animate-spin" /> {t.loading}</>}
      </p>
    )
  }

  const events = activity?.events ?? NO_EVENTS
  const approvals = activity?.approvals ?? NO_APPROVALS
  const proof = proofOf(evidence)
  const you = isMine(run, viewerId)
  const sequence = missionSequence(run, activity, sequenceTexts, you)
  const pull = pullRequestOf(run.resultUrl)
  const minutes = workMinutes(run) ?? elapsedMinutes(run.claimedAt ?? run.createdAt, now)
  const agent = missionAgentName(run, missions.agent)
  const model = run.providerKey === "taskforce-agent" ? null : missionModel(run, events)
  const pending = running ? approvals.filter((a) => a.status === "PENDING") : []
  const answered = approvals.filter((a) => a.status !== "PENDING")
  const key = run.issueKey ?? `#${run.issueId}`
  const goal = run.issueTitle ? `${run.issueTitle} (${key})` : key
  const worker = model ? `${agent} · ${model}` : agent
  const facts = [
    run.startedByName ? fillText(t.agentFor, { agent: worker, who: run.startedByName }) : worker,
    minutes === null ? null : minutes < 1 ? t.underAMinute : fillText(t.elapsed, { minutes }),
    // Des mots du métier : ils restent à l'interrupteur, comme les commandes.
    showCommands && run.branch ? fillText(t.branch, { branch: run.branch }) : null,
    showCommands && run.commits ? (run.commits === 1 ? t.oneCommit : fillText(t.commits, { count: run.commits })) : null,
  ].filter(Boolean).join(" · ")
  const projectId = run.projectId
  // La carte de résultat lit la dernière mission de l'issue : elle ne se montre que sur celle-ci.
  const judged = latest?.id === runId && run.status === "DONE" && !run.outcome
  const words = run.status === "DONE" && run.summary ? agentWords(run.summary) : ""

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-base font-semibold leading-snug text-foreground">
            {projectId === null ? key : (
              <PaneLink
                href={issuePath(slug, projectId, run.issueId)}
                open={() => openIssue({ projectId, issueId: run.issueId })}
                title={fillText(t.openIssue, { key })}
                className="underline-offset-4 hover:underline"
              >
                {key}
              </PaneLink>
            )}
            {run.issueTitle && <span> {run.issueTitle}</span>}
          </h3>
          {active && you && run.providerKey !== CANNOT_STOP && <StopMission slug={slug} run={run} agent={agent} />}
        </div>
        <p className="text-xs text-muted-foreground">{facts}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
          <WorkDot state={runState(run)} />
          <span className="min-w-0 break-words">{sequence.status}</span>
        </p>
        {/* La carte de résultat a son propre lien : un seul à l'écran. */}
        {pull && !judged && (
          <a href={pull.url} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex w-fit items-center gap-1 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
            <ExternalLink className="size-3" aria-hidden="true" /> {fillText(t.pullRequest, { repo: pull.repo, number: pull.number })}
          </a>
        )}
      </header>

      <section aria-label={t.steps} className="flex flex-col gap-1.5">
        <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {sequenceTexts.showCommands}
          <Switch checked={showCommands} onCheckedChange={setShowCommands} aria-label={sequenceTexts.showCommands} />
        </label>
        <MissionSteps
          steps={sequence.steps}
          showCommands={showCommands}
          waitingLabel={you ? undefined : sequenceTexts.states.waitingOther}
          waiting={pending.length > 0 ? (
            <div className="flex flex-col gap-2">
              {pending.map((approval) => (
                <PendingApproval key={approval.id} slug={slug} runId={runId} approval={approval} goal={goal} run={run} showCommand={showCommands} />
              ))}
            </div>
          ) : undefined}
        />
      </section>

      <MissionChanges run={run} />
      {/* Le relevé du runner tient la liste des fichiers : ceux d'après la chronologie ne servent qu'aux missions d'avant (R139). */}
      <MissionFiles run={run} events={events} documentsOnly={tracked} />

      {judged ? (
        <section aria-label={t.result}>
          <MissionResultCard slug={slug} issueId={run.issueId} issueKey={run.issueKey} issueTitle={run.issueTitle ?? key} responsible={null} embedded />
        </section>
      ) : words && (
        <section aria-label={t.result} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">{missions.result.inItsWords}</h3>
          <Markdown content={words} compact className="space-y-1.5 break-words text-xs leading-relaxed text-foreground" />
        </section>
      )}

      <div className="flex flex-col divide-y divide-border border-y border-border">
        {answered.length > 0 && <ApprovalsRow run={run} approvals={answered} you={you} showCommands={showCommands} />}
        <ProofRow slug={slug} runId={runId} count={proof.count} sealed={proof.sealed} />
      </div>
    </div>
  )
}
