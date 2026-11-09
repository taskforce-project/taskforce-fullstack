"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import { ExternalLink, FileCheck2, FilePen, FilePlus2, Loader2, MessageSquareText, ShieldQuestion, Wrench } from "lucide-react"

import { MissionChanges } from "@/components/delivery/mission-changes"
import { PaneLink } from "@/components/layout/pane-link"
import { WorkDot } from "@/components/layout/work-dot"
import { MissionResultCard } from "@/components/sheets/mission-result-card"
import { EVENT_ICON, PendingApproval } from "@/components/sheets/run-activity"
import { useNow } from "@/hooks/use-now"
import type { DeliveryRun, DeliveryRunEvent } from "@/lib/api/delivery-service"
import { approvalOutcome } from "@/lib/delivery/approval-words"
import { fillText, missionAgentName, pullRequestOf, workMinutes } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"
import { elapsedMinutes, isActiveRun, runState } from "@/lib/window/missions"
import { issuePath } from "@/lib/window/pane"
import { diffAnchor, documentChanges, evidenceKind, fileChanges, proofOf } from "@/lib/window/work-view"

/** Le rythme des relectures pendant que la mission tourne : son état et sa chronologie, puis son dossier. */
const RUN_MS = 2_000
const PROOF_MS = 5_000

const NO_EVENTS: readonly DeliveryRunEvent[] = []

function Section({ title, count, children }: Readonly<{ title: string; count?: number; children: ReactNode }>) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        {count !== undefined && count > 0 && <span className="tabular-nums normal-case">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Les ancres des fichiers dans la pull request, calculées une fois par chemin. */
function useDiffAnchors(paths: readonly string[]): Readonly<Record<string, string>> {
  const [anchors, setAnchors] = useState<Readonly<Record<string, string>>>({})
  const wanted = paths.join("\n")
  useEffect(() => {
    let live = true
    const list = wanted ? wanted.split("\n") : []
    void Promise.all(list.map(async (path) => [path, await diffAnchor(path)] as const)).then((pairs) => {
      if (!live) return
      setAnchors(Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair[1] !== null)))
    })
    return () => { live = false }
  }, [wanted])
  return anchors
}

const timeOf = (at: string | null): string =>
  at ? parseServerDate(at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""

/**
 * La vue du travail d'une mission (R95, point 3 ; R120, séance n°18) : un volet pour une mission, en direct. Ce que
 * l'agent fait, étape par étape, et chaque outil qu'il appelle ; les fichiers et les documents qu'il produit, avec leur
 * diff dans sa pull request ; les accords qu'il demande, à décider ici ; la preuve qui se construit, le dossier de la
 * mission, chaîné. Puis la carte de résultat, quand il attend la personne. Rien n'y juge ni ne classe l'agent (R57) :
 * on y lit ce qu'il a fait. Elle se lit dans ce que TaskForce a déjà : la mission, sa chronologie, son dossier.
 */
export function WorkView({ runId }: Readonly<{ runId: number }>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.workView)
  const missions = usePreferencesStore((s) => s.t.missions)
  const states = usePreferencesStore((s) => s.t.window.states)
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
  const downloadEvidence = useDeliveryStore((s) => s.downloadEvidence)
  const { openIssue } = usePaneNavigation()
  const now = useNow(30_000)
  const [checked, setChecked] = useState(false)

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

  const events = activity?.events ?? NO_EVENTS
  const files = useMemo(() => (tracked ? [] : fileChanges(events)), [events, tracked])
  const documents = useMemo(() => documentChanges(events), [events])
  const anchors = useDiffAnchors(files.map((file) => file.path))
  const proof = proofOf(evidence)

  if (!run) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        {checked ? t.notFound : <><Loader2 className="size-4 animate-spin" /> {t.loading}</>}
      </p>
    )
  }

  const state = runState(run)
  const pull = pullRequestOf(run.resultUrl)
  const minutes = workMinutes(run) ?? elapsedMinutes(run.claimedAt ?? run.createdAt, now)
  const agent = missionAgentName(run, missions.agent)
  const pending = running ? (activity?.approvals ?? []).filter((a) => a.status === "PENDING") : []
  const answered = (activity?.approvals ?? []).filter((a) => a.status !== "PENDING")
  const key = run.issueKey ?? `#${run.issueId}`
  const goal = run.issueTitle ? `${run.issueTitle} (${key})` : key
  const facts = [
    run.startedByName ? fillText(t.agentFor, { agent, who: run.startedByName }) : agent,
    minutes === null ? null : minutes < 1 ? t.underAMinute : fillText(t.elapsed, { minutes }),
    run.branch ? fillText(t.branch, { branch: run.branch }) : null,
    run.commits ? (run.commits === 1 ? t.oneCommit : fillText(t.commits, { count: run.commits })) : null,
  ].filter(Boolean).join(" · ")
  const projectId = run.projectId
  // La carte de résultat lit la dernière mission de l'issue : elle ne se montre que sur celle-ci.
  const judged = latest?.id === runId

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-sm">
          <WorkDot state={state} />
          <span className="text-muted-foreground">{states[state]}</span>
        </p>
        <h3 className="text-lg font-semibold leading-snug text-foreground">
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
        <p className="text-xs text-muted-foreground">{facts}</p>
        {pull && (
          <a href={pull.url} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex w-fit items-center gap-1 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
            <ExternalLink className="size-3" /> {fillText(t.pullRequest, { repo: pull.repo, number: pull.number })}
          </a>
        )}
      </header>

      {pending.length > 0 && (
        <Section title={t.waiting} count={pending.length}>
          {pending.map((approval) => <PendingApproval key={approval.id} slug={slug} runId={runId} approval={approval} goal={goal} />)}
        </Section>
      )}

      <Section title={t.steps} count={events.length}>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.noSteps}</p>
        ) : (
          <ol className="flex flex-col gap-1.5 border-l border-border pl-3" aria-label={t.steps}>
            {events.map((event) => {
              const Icon = EVENT_ICON[event.kind] ?? Wrench
              const failed = event.kind === "error" || event.kind === "denied" || event.kind === "limit"
              return (
                <li key={event.seq} className="flex items-start gap-2 text-xs leading-relaxed">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", failed ? "text-destructive" : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1 break-words">
                    {event.tool && <span className="font-medium text-foreground">{event.tool} </span>}
                    <span className={cn(event.kind === "tool" ? "font-mono text-[11px] text-muted-foreground" : "text-foreground")}>
                      {event.text}
                    </span>
                  </span>
                  {event.at && <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{timeOf(event.at)}</span>}
                </li>
              )
            })}
            {running && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              </li>
            )}
          </ol>
        )}
      </Section>

      <MissionChanges run={run} />

      {!(tracked && documents.length === 0) && (
      <Section title={t.files} count={files.length + documents.length}>
        {files.length === 0 && documents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.noFiles}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {files.map((file) => {
              const anchor = anchors[file.path]
              const diff = pull ? `${pull.url}/files${anchor ? `#${anchor}` : ""}` : null
              return (
                <li key={file.path} className="flex items-center gap-2 py-1.5 text-xs">
                  {file.kind === "written"
                    ? <FilePlus2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    : <FilePen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground" title={file.path}>{file.path}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {file.kind === "written" ? t.written : t.edited}
                    {file.times > 1 && ` · ${fillText(t.times, { count: file.times })}`}
                  </span>
                  {diff && (
                    <a href={diff} target="_blank" rel="noopener noreferrer" title={t.diffHint}
                      className="flex shrink-0 items-center gap-1 text-foreground underline-offset-2 hover:underline">
                      {t.diff} <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              )
            })}
            {documents.map((document) => (
              <li key={`doc-${document.seq}`} className="flex items-start gap-2 py-1.5 text-xs">
                <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">
                  <span className="text-muted-foreground">{t.documents[document.gesture]}</span>
                  {document.issue && <span className="font-medium text-foreground"> {document.issue}</span>}
                  {document.text && <span className="text-foreground">: {document.text}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      )}

      <Section title={t.approvals} count={answered.length}>
        {answered.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.noApprovals}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {answered.map((approval) => (
              <li key={approval.id} className="flex items-start gap-2 text-xs">
                <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  <span className="font-medium text-foreground">{approval.tool} </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{approval.summary}</span>
                  <span className="text-muted-foreground">: {approvalOutcome(approval, missions)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.proof} count={proof.count}>
        {proof.count === 0 ? (
          <p className="text-xs text-muted-foreground">{t.proofNone}</p>
        ) : (
          <>
            <p className="text-xs text-foreground">
              {proof.count === 1 ? t.proofOne : fillText(t.proofCount, { count: proof.count })}{" "}
              <span className="text-muted-foreground">
                {proof.sealed && proof.root ? fillText(t.proofSealed, { root: proof.root.slice(0, 12) }) : t.proofBuilding}
              </span>
            </p>
            <ol className="flex flex-col gap-1" aria-label={t.proof}>
              {proof.latest.map((event) => {
                const kind = evidenceKind(event.type)
                const actor = (t.actors as Readonly<Record<string, string>>)[event.actor.kind] ?? event.actor.kind
                return (
                  <li key={event.seq} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">#{event.seq}</span>
                    <span className="min-w-0 truncate text-foreground">
                      {kind ? t.kinds[kind] : event.type} <span className="text-muted-foreground">· {actor}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground" title={event.hash}>{event.hash.slice(0, 8)}</span>
                  </li>
                )
              })}
            </ol>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FileCheck2 className="size-3 shrink-0" />
              {t.download}
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => void downloadEvidence(slug, runId, "json")}>JSON</button>
              <span aria-hidden="true">·</span>
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => void downloadEvidence(slug, runId, "md")}>Markdown</button>
            </p>
          </>
        )}
      </Section>

      {judged && run.status === "DONE" && !run.outcome && (
        <Section title={t.result}>
          <MissionResultCard slug={slug} issueId={run.issueId} issueKey={run.issueKey} issueTitle={run.issueTitle ?? key} responsible={null} />
        </Section>
      )}
    </div>
  )
}
