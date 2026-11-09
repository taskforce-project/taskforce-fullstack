"use client"

import { useState } from "react"
import { Loader2, ShieldQuestion } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { DeliveryRunApproval } from "@/lib/api/delivery-service"
import { approvalWords, deadlineText } from "@/lib/delivery/approval-words"
import { requestWant, requestWords, type SequencedRun } from "@/lib/delivery/mission-sequence"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { parseServerDate } from "@/lib/utils/server-date"

/** Minutes entières avant l'échéance d'une demande (0 si elle est passée). */
function minutesLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0
  return Math.max(0, Math.ceil((parseServerDate(expiresAt).getTime() - Date.now()) / 60_000))
}

function Said({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  )
}

/**
 * « Accorder » (R78, séance n°13) : la demande dite en mots, ce que l'agent veut faire, pourquoi on la pose (la raison
 * de la règle), sa tâche, ce qui se passe si l'on refuse ; la commande reste repliée (R49, R133). Un accord de l'agent vaut
 * pour le reste de la mission (R46) ; une demande de TaskForce lui-même (une sortie, un départ) vaut une fois. Sans
 * réponse, c'est non, et le déroulé le dit ensuite. `compact` : dans la conversation et sur l'issue, une ligne et ses deux
 * boutons (ce qui attend se montre là où l'on regarde) ; le pourquoi se lit dans la vue du travail.
 */
export function PendingApproval({ slug, runId, approval, goal, run, compact = false, showCommand = false }: Readonly<{
  slug: string
  runId: number
  approval: DeliveryRunApproval
  goal?: string
  run: SequencedRun
  compact?: boolean
  /** L'interrupteur « Show commands » de la vue du travail est mis. */
  showCommand?: boolean
}>) {
  const t = usePreferencesStore((s) => s.t.missions)
  const sequence = usePreferencesStore((s) => s.t.missionSequence)
  const decide = useDeliveryStore((s) => s.decideApproval)
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null)
  const words = approvalWords(approval, t, requestWant(approval, run, sequence))
  const forMission = approval.askedBy !== "runner"
  const deadline = deadlineText(minutesLeft(approval.expiresAt), t)

  async function onDecide(allow: boolean) {
    setBusy(allow ? "allow" : "deny")
    const ok = await decide(slug, runId, approval.id, allow, allow && forMission)
    setBusy(null)
    if (ok) toast.success(allow ? (forMission ? t.allowedForMission : t.allowed) : t.refused)
  }

  const buttons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy !== null} onClick={() => onDecide(false)}>
        {busy === "deny" ? <Loader2 className="size-3 animate-spin" /> : t.refuse}
      </Button>
      <Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy !== null} onClick={() => onDecide(true)}>
        {busy === "allow" ? <Loader2 className="size-3 animate-spin" /> : forMission ? t.allowForMission : t.allowOnce}
      </Button>
    </div>
  )

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5 border border-shape-yellow/50 bg-tint-yellow px-2.5 py-2 text-xs" role="group" aria-label={words.title}>
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <ShieldQuestion className="size-3.5 shrink-0 text-ink-yellow" aria-hidden="true" />
          <span className="min-w-0 break-words">{words.title}</span>
        </span>
        {approval.canDecide ? buttons : <span className="text-[11px] text-muted-foreground">{t.waitingFor}</span>}
        <span className="text-[11px] text-muted-foreground">{deadline}</span>
      </div>
    )
  }

  const command = `${approval.tool} ${approval.summary}`
  return (
    <div className="flex flex-col border border-shape-yellow/50 bg-background text-xs" role="group" aria-label={words.title}>
      <div className="flex flex-col gap-0.5 border-b border-shape-yellow/40 bg-tint-yellow px-2.5 py-2">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <ShieldQuestion className="size-3.5 shrink-0 text-ink-yellow" aria-hidden="true" />
          {words.title}
        </span>
        <span className="break-words text-muted-foreground">{requestWords(approval, run, sequence)}</span>
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
            {buttons}
            <span className="text-[11px] text-muted-foreground">{deadline}</span>
            {forMission && <span className="text-[11px] text-muted-foreground">{t.forMissionHint}</span>}
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">{t.waitingFor} {deadline}</span>
        )}
        {showCommand ? (
          <code className="block overflow-x-auto whitespace-pre-wrap break-all bg-muted px-1.5 py-1 font-mono text-[11px]">{command}</code>
        ) : (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.showCommand}</summary>
            <code className="mt-1 block overflow-x-auto whitespace-pre-wrap break-all bg-muted px-1.5 py-1 font-mono text-[11px]">{command}</code>
          </details>
        )}
      </div>
    </div>
  )
}
