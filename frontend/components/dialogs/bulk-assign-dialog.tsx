"use client"

import { useState } from "react"
import { Sparkles, Loader2, Check, X, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ShimmerLoader } from "@/components/ui/shimmer-loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { smartAssignBulk, type Issue, type SmartAssignCandidate } from "@/lib/api/issue-service"

/** Messages du loader Smart Assign en lot (bouclés : compétences / charge / dispo de toute l'équipe). */
const BULK_ASSIGN_PHASES = [
  "Analyzing the team…",
  "Weighing skills…",
  "Calculating availability…",
  "Finding the best matches…",
]

interface Row {
  issueId: number
  identifier: string
  title: string
  candidate: SmartAssignCandidate
  /** Ligne exclue du plan (l'utilisateur ne veut pas cette suggestion). */
  skipped: boolean
}

interface BulkAssignDialogProps {
  readonly slug: string
  readonly projectId: number
  readonly issues: Issue[]
}

/**
 * Multi-assign (PROD-1.9), refonte Linear-like : au lieu d'un tableau a cocher score-par-score,
 * on présente un PLAN a valider (issue -> qui). Chaque suggestion (personne ou agent) est proposée ;
 * on peut écarter une ligne d'un clic ("skip"), puis appliquer tout le reste en une action.
 * Pas de scores affichés : la reco est une proposition, pas un classement a lire. Cf.
 * linear.app/docs/assigning-issues.
 */
export function BulkAssignDialog({ slug, projectId, issues }: BulkAssignDialogProps) {
  const { updateIssue } = useIssueStore()
  const delegate = useDeliveryStore((s) => s.delegate)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [ran, setRan] = useState(false)
  const [rows, setRows] = useState<Row[]>([])

  const unassigned = issues.filter((i) => i.assignee == null)
  const active = rows.filter((r) => !r.skipped)
  const activeCount = active.length
  // Résumé du plan : personnes distinctes + agents (rend visible "tout a la meme personne").
  const distinctUsers = new Set(
    active.filter((r) => r.candidate.kind === "user").map((r) => r.candidate.userId)
  ).size
  const agentCount = active.filter((r) => r.candidate.kind === "agent").length

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) { setRows([]); setRan(false); return }
    if (unassigned.length === 0) return

    setLoading(true)
    setRan(false)
    try {
      const items = await smartAssignBulk(slug, projectId, unassigned.map((i) => i.id))
      const byId = new Map(issues.map((i) => [i.id, i]))
      const next2: Row[] = items
        .filter((it) => it.recommended)
        .map((it) => {
          const issue = byId.get(it.issueId)
          return {
            issueId: it.issueId,
            identifier: issue?.identifier ?? `#${it.issueId}`,
            title: issue?.title ?? "",
            candidate: it.recommended!,
            skipped: false,
          }
        })
      setRows(next2)
      setRan(true)
      if (next2.length === 0) toast.warning("No recommendations - add members or skills")
    } catch {
      toast.error("Could not generate recommendations")
    } finally {
      setLoading(false)
    }
  }

  function toggleSkip(issueId: number) {
    setRows((rs) => rs.map((r) => (r.issueId === issueId ? { ...r, skipped: !r.skipped } : r)))
  }

  async function applyAll() {
    if (active.length === 0) return
    setApplying(true)
    try {
      // Les stores avalent l'erreur et renvoient null en echec : on compte les retours (pas de catch).
      // Une reco d'agent est DELEGUEE (delivery), une reco humaine est ASSIGNEE (issue).
      const results = await Promise.all(
        active.map(async (r) => {
          if (r.candidate.kind === "agent" && r.candidate.agentKey) {
            const run = await delegate(slug, r.issueId, r.candidate.agentKey)
            return { ok: run != null, agent: true }
          }
          const upd = r.candidate.userId != null
            ? await updateIssue(slug, projectId, r.issueId, { assigneeId: r.candidate.userId })
            : null
          return { ok: upd != null, agent: false }
        })
      )
      const assigned  = results.filter((x) => x.ok && !x.agent).length
      const delegated = results.filter((x) => x.ok && x.agent).length
      const failed    = results.filter((x) => !x.ok).length
      if (assigned > 0)  toast.success(`${assigned} issue${assigned > 1 ? "s" : ""} assigned`)
      if (delegated > 0) toast.success(`${delegated} issue${delegated > 1 ? "s" : ""} delegated to an agent`)
      if (failed > 0)    toast.error(`${failed} action${failed > 1 ? "s" : ""} failed`)
      if (assigned + delegated > 0) {
        setOpen(false)
        setRows([])
        setRan(false)
      }
    } catch {
      toast.error("Assignment failed")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={unassigned.length > 0 ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={unassigned.length === 0}
        >
          <Sparkles className={`size-3.5 ${unassigned.length > 0 ? "" : "text-primary"}`} />
          Auto-assign{unassigned.length > 0 ? ` (${unassigned.length})` : ""}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Auto-assign
          </DialogTitle>
          <DialogDescription>
            A suggested assignee for each unassigned issue. Skip any you disagree with, then apply.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <ShimmerLoader phrases={BULK_ASSIGN_PHASES} className="text-xs" />
          </div>
        ) : ran && rows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex max-h-[55vh] flex-col divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
              {rows.map((r) => {
                const isAgent = r.candidate.kind === "agent"
                const name = r.candidate.displayName ?? r.candidate.email ?? "Agent"
                const first = name.split(" ")[0]
                const why = r.candidate.reason ?? (r.candidate.factors?.length ? r.candidate.factors.join(" · ") : undefined)
                return (
                  <div
                    key={r.issueId}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-2 transition-colors",
                      r.skipped ? "bg-muted/20" : "hover:bg-muted/30"
                    )}
                  >
                    <span className={cn("w-16 shrink-0 truncate font-mono text-[10px] text-muted-foreground", r.skipped && "opacity-50")}>
                      {r.identifier}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-xs", r.skipped ? "text-muted-foreground line-through" : "text-foreground")}>
                      {r.title}
                    </span>

                    {/* Suggestion (personne ou agent). Le "pourquoi" au survol (title). */}
                    <span
                      className={cn("flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 transition-opacity",
                        r.skipped ? "border-transparent opacity-40" : "border-border/70")}
                      title={why}
                    >
                      {isAgent ? (
                        <span className="flex size-5 items-center justify-center overflow-hidden rounded-full border border-border bg-muted p-0.5">
                          <BrandLogo slug={r.candidate.agentLogoKey ?? "sparkles"} name={name} className="size-full" />
                        </span>
                      ) : (
                        <UserAvatar
                          email={r.candidate.email ?? undefined}
                          name={name}
                          avatarUrl={r.candidate.avatarUrl}
                          className="size-5 shrink-0"
                          fallbackClassName="text-[8px]"
                        />
                      )}
                      <span className="max-w-24 truncate text-xs font-medium text-foreground/90">
                        {isAgent ? `→ ${first}` : first}
                      </span>
                    </span>

                    {/* Skip / restaurer : discret (survol) quand inclus, visible quand écarté. */}
                    <button
                      type="button"
                      onClick={() => toggleSkip(r.issueId)}
                      aria-label={r.skipped ? "Include this issue" : "Skip this issue"}
                      title={r.skipped ? "Include" : "Skip"}
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
                        r.skipped ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {r.skipped ? <RotateCcw className="size-3.5" /> : <X className="size-3.5" />}
                    </button>
                  </div>
                )
              })}
            </div>

            <p className="px-0.5 text-[11px] text-muted-foreground">
              {activeCount} of {rows.length} · {distinctUsers} {distinctUsers > 1 ? "people" : "person"}
              {agentCount > 0 ? ` · ${agentCount} agent${agentCount > 1 ? "s" : ""}` : ""}
            </p>
          </div>
        ) : ran ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No recommendations available.</p>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{unassigned.length} unassigned issue(s) to process.</p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={applyAll} disabled={applying || activeCount === 0}>
            {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Assign{activeCount > 0 ? ` ${activeCount}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
