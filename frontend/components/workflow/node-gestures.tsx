"use client"

import { useCallback, useMemo, useState } from "react"
import { Loader2, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DeliveryProvider } from "@/lib/api/delivery-service"
import type { IssueStatus } from "@/lib/api/issue-service"
import { fillText } from "@/lib/delivery/result-card"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { isMine } from "@/lib/window/missions"
import type { WorkflowNode } from "@/lib/workflow/model"

/** Copilot travaille sur GitHub : TaskForce ne sait pas l'y arrêter, le geste n'existe pas pour lui (R15). */
const CANNOT_STOP = "github-copilot"

/** Ce que la personne peut faire d'un nœud, maintenant (§6.2) : seulement ce qui marche vraiment (R15). */
export interface NodeCan {
  readonly stop: boolean
  readonly retry: boolean
  readonly handToAgent: boolean
  /** Le nœud pourrait aller à un agent (pas commencé ou arrêté, sans mission au travail, la personne écrit) : prêt ou non. */
  readonly handable: boolean
  readonly move: boolean
}

/**
 * Ce que la personne peut faire du nœud. `canWrite` : son droit d'écrire dans le projet (`canWriteProject`) ; sans lui,
 * ni déplacer, ni confier à un agent, deux écritures que le serveur refuserait à un membre en lecture seule.
 */
export function nodeCan(
  node: WorkflowNode, me: string | number | null | undefined, agents: readonly DeliveryProvider[], canWrite = true,
): NodeCan {
  const run = node.run?.run ?? null
  const active = run !== null && (run.status === "RUNNING" || run.status === "QUEUED")
  const mine = run !== null && isMine(run, me)
  const handable = canWrite && !active && (node.state === "notStarted" || node.state === "stopped")
  return {
    // Arrêter : une mission au travail, par la personne qui l'a déléguée (la route le vérifie aussi).
    stop: active && mine && run.providerKey !== CANNOT_STOP,
    // Relancer : un échec de sa mission, après avoir lu la cause.
    retry: node.state === "failed" && mine,
    // Confier : une issue pas commencée, sans mission en cours, quand un agent est prêt pour ce projet.
    handToAgent: handable && agents.some((a) => a.available && a.ready),
    handable,
    move: canWrite,
  }
}

/**
 * Les gestes d'un nœud (§6.2), chacun par la route qui existe, jugé par les règles et entré au dossier : déplacer (la
 * route du tableau, « Moved to {column}. Undo » pendant 5 s), arrêter (une question d'abord : une mission arrêtée ne
 * reprend pas), relancer, confier à un agent, demander à Cortex (le nœud se joint au compositeur).
 */
export function useNodeGestures(slug: string, projectId: number) {
  const t = usePreferencesStore((s) => s.t.workflow.gesture)
  const asked = usePreferencesStore((s) => s.t.workflow.inspector.asked)
  const updateIssue = useIssueStore((s) => s.updateIssue)
  const stopRun = useDeliveryStore((s) => s.stopRun)
  const retryRun = useDeliveryStore((s) => s.retryRun)
  const delegate = useDeliveryStore((s) => s.delegate)
  const fetchProjectRun = useDeliveryStore((s) => s.fetchProjectRun)
  const attach = useCortexStore((s) => s.attach)
  const setChatOpen = useCortexStore((s) => s.setOpen)

  const move = useCallback(async (node: WorkflowNode, status: IssueStatus) => {
    const previous = node.issue.status
    if (previous.id === status.id) return
    const moved = await updateIssue(slug, projectId, node.issue.id, { statusId: status.id })
    if (!moved) {
      toast.error(t.moveFailed)
      return
    }
    toast.success(fillText(t.moved, { column: status.name }), {
      duration: 5000,
      action: {
        label: t.undo,
        onClick: () => {
          void updateIssue(slug, projectId, node.issue.id, { statusId: previous.id }).then((back) => {
            if (!back) toast.error(t.moveFailed)
          })
        },
      },
    })
  }, [slug, projectId, updateIssue, t])

  const stop = useCallback(async (node: WorkflowNode): Promise<boolean> => {
    const run = node.run?.run
    if (!run) return false
    const ok = await stopRun(slug, run.issueId, run.id)
    if (ok) {
      toast.success(t.stopped)
      void fetchProjectRun(slug, projectId, run.id)
    } else {
      toast.error(t.stopFailed)
    }
    return ok
  }, [slug, projectId, stopRun, fetchProjectRun, t])

  const retry = useCallback(async (node: WorkflowNode) => {
    const run = node.run?.run
    if (!run) return
    const next = await retryRun(slug, run.issueId, run.id, "")
    if (next) {
      toast.success(t.retried)
      // Le nouvel essai prend la place de la mission échouée : le nœud passe au travail, jamais au vert d'avance.
      void fetchProjectRun(slug, projectId, next.id)
      void fetchProjectRun(slug, projectId, run.id)
    } else {
      toast.error(t.retryFailed)
    }
  }, [slug, projectId, retryRun, fetchProjectRun, t])

  const handTo = useCallback(async (node: WorkflowNode, agent: DeliveryProvider) => {
    const run = await delegate(slug, node.issue.id, agent.key)
    if (run) {
      toast.success(fillText(t.handed, { agent: agent.displayName }))
      void fetchProjectRun(slug, projectId, run.id)
    } else {
      toast.error(t.handFailed)
    }
  }, [slug, projectId, delegate, fetchProjectRun, t])

  const ask = useCallback((node: WorkflowNode) => {
    attach({ kind: "issue", projectId, issueId: node.issue.id, label: node.issue.identifier, title: node.issue.title })
    setChatOpen(true)
    requestAnimationFrame(() => document.getElementById("command-bar-input")?.focus())
    toast(fillText(asked, { key: node.issue.identifier }))
  }, [projectId, attach, setChatOpen, asked])

  return useMemo(() => ({ move, stop, retry, handTo, ask }), [move, stop, retry, handTo, ask])
}

export type NodeGestures = ReturnType<typeof useNodeGestures>

/** « Stop this mission? » : un dialogue de 420 px, une colonne et une action (R133). */
export function StopDialog({ open, onOpenChange, onConfirm }: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<boolean>
}>) {
  const t = usePreferencesStore((s) => s.t.workflow.gesture)
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t.stopTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.stopBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t.stopKeep}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              setBusy(true)
              void onConfirm().finally(() => {
                setBusy(false)
                onOpenChange(false)
              })
            }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : t.stopConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Le menu du nœud, dans l'en-tête de l'inspecteur : ouvrir, et les gestes qui marchent pour ce nœud, maintenant. `m`
 * l'ouvre sur « Move to… ».
 */
export function NodeMenu({ node, stages, can, agents, gestures, onOpen, open, onOpenChange }: Readonly<{
  node: WorkflowNode
  stages: readonly IssueStatus[]
  can: NodeCan
  agents: readonly DeliveryProvider[]
  gestures: NodeGestures
  onOpen: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const t = usePreferencesStore((s) => s.t.workflow.gesture)
  const [stopping, setStopping] = useState(false)
  const ready = agents.filter((agent) => agent.available && agent.ready)
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={fillText(t.menu, { title: node.issue.title })}
            title={fillText(t.menu, { title: node.issue.title })}
            className="flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onOpen}>{t.open}</DropdownMenuItem>
          {can.move && stages.length > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t.moveTo}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {stages.filter((stage) => stage.id !== node.issue.status.id).map((stage) => (
                  <DropdownMenuItem key={stage.id} onSelect={() => void gestures.move(node, stage)}>{stage.name}</DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {can.retry && <DropdownMenuItem onSelect={() => void gestures.retry(node)}>{t.retry}</DropdownMenuItem>}
          {can.handToAgent && ready.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t.handToAgent}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {ready.map((agent) => (
                  <DropdownMenuItem key={agent.key} onSelect={() => void gestures.handTo(node, agent)}>{agent.displayName}</DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {can.stop && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStopping(true)}>{t.stop}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <StopDialog open={stopping} onOpenChange={setStopping} onConfirm={() => gestures.stop(node)} />
    </>
  )
}
