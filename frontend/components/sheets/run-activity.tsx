"use client"

import { useState } from "react"
import { Ban, CircleAlert, FileCheck2, FlaskConical, Loader2, MessageSquareText, Play, ShieldQuestion, Upload, Wrench } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { DeliveryRunActivity, DeliveryRunApproval, DeliveryRunEvent } from "@/lib/api/delivery-service"
import { approvalOutcome, approvalWords, deadlineText } from "@/lib/delivery/approval-words"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"

/**
 * Activité d'un run du runner local sur la fiche d'issue (lot 5) : la chronologie en direct de Claude Code et ses
 * demandes de validation. Seule la personne qui a délégué peut autoriser ou refuser (l'action tourne sur sa
 * machine) ; les autres voient la demande en attente.
 */

const EVENT_ICON: Record<DeliveryRunEvent["kind"], React.ElementType> = {
  start: Play,
  text: MessageSquareText,
  tool: Wrench,
  error: CircleAlert,
  denied: Ban,
  exit: Upload,
  limit: CircleAlert,
  test: FlaskConical,
}

/** Minutes entières avant l'échéance d'une demande (0 si elle est passée). */
function minutesLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0
  return Math.max(0, Math.ceil((parseServerDate(expiresAt).getTime() - Date.now()) / 60_000))
}

function Said({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  )
}

/**
 * « Accorder » (R78, séance n°13) : la demande dite en mots, ce que l'agent veut faire, pourquoi on la pose (la raison
 * de la règle), sa tâche, ce qui se passe si l'on refuse ; la commande reste repliée (R49). Un accord de l'agent vaut
 * pour le reste de la mission (R46) ; une demande de TaskForce lui-même (une sortie, un départ) vaut une fois. Sans
 * réponse, c'est non, et la chronologie le dit ensuite.
 */
function PendingApproval({ slug, runId, approval, goal }: Readonly<{
  slug: string
  runId: number
  approval: DeliveryRunApproval
  goal?: string
}>) {
  const t = usePreferencesStore((s) => s.t.missions)
  const decide = useDeliveryStore((s) => s.decideApproval)
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null)
  const words = approvalWords(approval, t)
  const forMission = approval.askedBy !== "runner"
  const deadline = deadlineText(minutesLeft(approval.expiresAt), t)

  async function onDecide(allow: boolean) {
    setBusy(allow ? "allow" : "deny")
    const ok = await decide(slug, runId, approval.id, allow, allow && forMission)
    setBusy(null)
    if (ok) toast.success(allow ? (forMission ? t.allowedForMission : t.allowed) : t.refused)
  }

  return (
    <div className="flex flex-col border border-shape-yellow/50 bg-background text-xs" role="group" aria-label={words.title}>
      <div className="flex flex-col gap-0.5 border-b border-shape-yellow/40 bg-tint-yellow px-2.5 py-2">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <ShieldQuestion className="size-3.5 shrink-0 text-ink-yellow" />
          {words.title}
        </span>
        <span className="break-all font-mono text-[11px] text-muted-foreground">{approval.summary}</span>
      </div>
      <dl className="flex flex-col gap-1.5 px-2.5 py-2">
        <Said label={t.willDo}>{words.will}</Said>
        <Said label={t.whyWeAsk}>{words.why}</Said>
        {goal && <Said label={t.understood}>{goal}</Said>}
        <Said label={t.ifRefused}>{words.ifRefused}</Said>
      </dl>
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
        {approval.canDecide ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy !== null} onClick={() => onDecide(false)}>
                {busy === "deny" ? <Loader2 className="size-3 animate-spin" /> : t.refuse}
              </Button>
              <Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy !== null} onClick={() => onDecide(true)}>
                {busy === "allow" ? <Loader2 className="size-3 animate-spin" /> : forMission ? t.allowForMission : t.allowOnce}
              </Button>
            </div>
            <span className="text-[10px] text-muted-foreground">{deadline}</span>
            {forMission && <span className="text-[10px] text-muted-foreground">{t.forMissionHint}</span>}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">{t.waitingFor} {deadline}</span>
        )}
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.showCommand}</summary>
          <code className="mt-1 block overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted px-1.5 py-1 font-mono text-[11px]">
            {approval.tool} {approval.summary}
          </code>
        </details>
      </div>
    </div>
  )
}

export function RunActivity({ slug, runId, activity, live, goal }: Readonly<{
  slug: string
  runId: number
  activity: DeliveryRunActivity | undefined
  /** Le run tourne encore : les demandes en attente peuvent être décidées. */
  live: boolean
  /** La tâche de la mission (le titre de l'issue et sa clé), que la demande d'accord rappelle. */
  goal?: string
}>) {
  const t = usePreferencesStore((s) => s.t.missions)
  const [expanded, setExpanded] = useState(live)
  const downloadEvidence = useDeliveryStore((s) => s.downloadEvidence)
  const events = activity?.events ?? []
  const pending = live ? (activity?.approvals ?? []).filter((a) => a.status === "PENDING") : []
  const answered = (activity?.approvals ?? []).filter((a) => a.status !== "PENDING")

  if (events.length === 0 && pending.length === 0 && answered.length === 0) return null

  /** Le dossier de la mission : chaque action, règle et décision, chaînées pour qu'un changement se voie. */
  async function download(format: "json" | "md") {
    if (!(await downloadEvidence(slug, runId, format))) {
      toast.error("No record for this run: it ran before TaskForce kept them.")
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {pending.map((approval) => <PendingApproval key={approval.id} slug={slug} runId={runId} approval={approval} goal={goal} />)}

      <button type="button" className="w-fit text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Hide activity" : `Show activity (${events.length} ${events.length === 1 ? "step" : "steps"})`}
      </button>

      {expanded && (
        <ol className="flex max-h-56 flex-col gap-1 overflow-y-auto border-l border-border pl-2" aria-label="Agent activity">
          {events.map((event) => {
            const Icon = EVENT_ICON[event.kind] ?? Wrench
            return (
              <li key={event.seq} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <Icon className={cn("mt-0.5 size-3 shrink-0", event.kind === "error" || event.kind === "denied" || event.kind === "limit"
                  ? "text-destructive" : "text-muted-foreground")} />
                <span className="min-w-0 break-words text-foreground">
                  {event.tool && <span className="font-medium">{event.tool} </span>}
                  <span className={cn(event.kind === "tool" && "font-mono text-[10px] text-muted-foreground")}>{event.text}</span>
                </span>
              </li>
            )
          })}
          {answered.map((approval) => (
            <li key={`approval-${approval.id}`} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <ShieldQuestion className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words text-foreground">
                <span className="font-medium">{approval.tool} </span>
                <span className="font-mono text-[10px] text-muted-foreground">{approval.summary}</span>
                <span className="text-muted-foreground">: {approvalOutcome(approval, t)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {!live && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          title="Every action, rule and decision of this run, chained so that any later change shows.">
          <FileCheck2 className="size-3 shrink-0" />
          Download the record:
          <button type="button" className="hover:text-foreground hover:underline" onClick={() => void download("json")}>JSON</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="hover:text-foreground hover:underline" onClick={() => void download("md")}>Markdown</button>
        </p>
      )}
    </div>
  )
}
