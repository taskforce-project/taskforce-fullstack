"use client"

import { useState } from "react"
import { Ban, CircleAlert, FileCheck2, Loader2, MessageSquareText, Play, ShieldQuestion, Upload, Wrench } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { DeliveryRunActivity, DeliveryRunApproval, DeliveryRunEvent } from "@/lib/api/delivery-service"
import { useDeliveryStore } from "@/lib/store/delivery-store"
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
}

function minutesLeft(expiresAt: string | null): string {
  if (!expiresAt) return ""
  const minutes = Math.max(0, Math.ceil((parseServerDate(expiresAt).getTime() - Date.now()) / 60_000))
  return minutes <= 1 ? "less than a minute left" : `${minutes} min left`
}

function PendingApproval({ slug, runId, approval }: Readonly<{ slug: string; runId: number; approval: DeliveryRunApproval }>) {
  const decide = useDeliveryStore((s) => s.decideApproval)
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null)

  async function onDecide(allow: boolean) {
    setBusy(allow ? "allow" : "deny")
    const ok = await decide(slug, runId, approval.id, allow)
    setBusy(null)
    if (ok) toast.success(allow ? "Allowed: the agent goes on" : "Denied: the agent goes on without it")
  }

  return (
    <div className="flex flex-col gap-1.5 rounded border border-shape-yellow/40 bg-shape-yellow/5 p-2" role="group"
      aria-label={`Approval request: ${approval.tool}`}>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <ShieldQuestion className="size-3.5 text-ink-yellow" /> Claude Code asks to run {approval.tool}
      </span>
      <code className="block overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted px-1.5 py-1 font-mono text-[11px]">
        {approval.summary}
      </code>
      {approval.canDecide ? (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy !== null} onClick={() => onDecide(true)}>
            {busy === "allow" ? <Loader2 className="size-3 animate-spin" /> : "Allow"}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" disabled={busy !== null} onClick={() => onDecide(false)}>
            {busy === "deny" ? <Loader2 className="size-3 animate-spin" /> : "Deny"}
          </Button>
          <span className="text-[10px] text-muted-foreground">{minutesLeft(approval.expiresAt)}, then it is denied</span>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground">
          Waiting for the person who delegated this task to allow or deny it ({minutesLeft(approval.expiresAt)}).
        </span>
      )}
    </div>
  )
}

function approvalLine(approval: DeliveryRunApproval): string | null {
  switch (approval.status) {
    case "ALLOWED": return `Allowed by ${approval.decidedBy ?? "the delegator"}`
    case "DENIED": return `Denied by ${approval.decidedBy ?? "the delegator"}`
    case "EXPIRED": return "No answer in time: denied"
    default: return null
  }
}

export function RunActivity({ slug, runId, activity, live }: Readonly<{
  slug: string
  runId: number
  activity: DeliveryRunActivity | undefined
  /** Le run tourne encore : les demandes en attente peuvent être décidées. */
  live: boolean
}>) {
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
      {pending.map((approval) => <PendingApproval key={approval.id} slug={slug} runId={runId} approval={approval} />)}

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
                <span className="text-muted-foreground">: {approvalLine(approval)}</span>
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
