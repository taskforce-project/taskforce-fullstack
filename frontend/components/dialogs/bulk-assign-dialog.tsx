"use client"

import { useState } from "react"
import { Sparkles, Loader2, Check, Minus, ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
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
import { smartAssignBulk, type Issue, type SmartAssignCandidate } from "@/lib/api/issue-service"

/** Teinte du badge de score selon la confiance (aligné sur la jauge du panneau Smart Assign). */
/** Messages du loader Smart Assign en lot (bouclés : compétences / charge / dispo de toute l'équipe). */
const BULK_ASSIGN_PHASES = [
  "Analyzing the team…",
  "Weighing skills…",
  "Calculating availability…",
  "Finding the best matches…",
]

function scoreTone(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "bg-amber-500/15 text-amber-600 dark:text-amber-400"
  return "bg-muted text-muted-foreground"
}

interface Row {
  issueId: number
  identifier: string
  title: string
  candidate: SmartAssignCandidate
  selected: boolean
}

interface BulkAssignDialogProps {
  readonly slug: string
  readonly projectId: number
  readonly issues: Issue[]
}

/**
 * Multi-assign (PROD-1.9) : recommande puis assigne en lot toutes les issues non assignées.
 */
export function BulkAssignDialog({ slug, projectId, issues }: BulkAssignDialogProps) {
  const { updateIssue } = useIssueStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [ran, setRan] = useState(false)
  const [rows, setRows] = useState<Row[]>([])

  const unassigned = issues.filter((i) => i.assignee == null)
  const selected = rows.filter((r) => r.selected)
  const selectedCount = selected.length
  const allSelected = rows.length > 0 && selectedCount === rows.length
  // Nb de personnes distinctes visées - rend visible le cas « tout à la même personne »
  // (charge/skills concentrés) sans le masquer derrière une liste d'issues.
  const distinctAssignees = new Set(selected.map((r) => r.candidate.userId)).size

  function toggleAll() {
    const next = !allSelected
    setRows((rs) => rs.map((r) => ({ ...r, selected: next })))
  }

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
            selected: true,
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

  function toggle(issueId: number) {
    setRows((rs) => rs.map((r) => (r.issueId === issueId ? { ...r, selected: !r.selected } : r)))
  }

  async function applyAll() {
    if (selected.length === 0) return
    setApplying(true)
    try {
      await Promise.all(
        selected.map((r) => updateIssue(slug, projectId, r.issueId, { assigneeId: r.candidate.userId }))
      )
      toast.success(`${selected.length} issue${selected.length > 1 ? "s" : ""} assigned${selected.length > 1 ? "" : ""}`)
      setOpen(false)
      setRows([])
      setRan(false)
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
            <Sparkles className="size-4 text-primary" /> Smart Assign - unassigned issues
          </DialogTitle>
          <DialogDescription>
            Recommendations based on skills, workload and availability. Uncheck the ones to exclude.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <ShimmerLoader phrases={BULK_ASSIGN_PHASES} className="text-xs" />
          </div>
        ) : ran && rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {/* Barre d'outils : tout cocher/décocher + résumé (issues sélectionnées · personnes distinctes) */}
            <div className="flex items-center justify-between gap-2 px-0.5">
              <button
                type="button"
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  allSelected ? "border-primary bg-primary text-primary-foreground"
                    : selectedCount > 0 ? "border-primary bg-primary/20 text-primary"
                    : "border-border"
                )}>
                  {allSelected ? <Check className="size-3" /> : selectedCount > 0 ? <Minus className="size-3" /> : null}
                </span>
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {selectedCount}/{rows.length} · {distinctAssignees} {distinctAssignees > 1 ? "people" : "person"}
              </span>
            </div>

            <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-0.5">
              {rows.map((r) => {
                const name = r.candidate.displayName ?? r.candidate.email
                return (
                  <button
                    key={r.issueId}
                    type="button"
                    onClick={() => toggle(r.issueId)}
                    title={r.candidate.factors?.length ? r.candidate.factors.join(" · ") : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                      r.selected ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                    )}
                  >
                    <span className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      r.selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    )}>
                      {r.selected && <Check className="size-3" />}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 truncate">{r.identifier}</span>
                    <span className="flex-1 text-xs truncate">{r.title}</span>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
                    <UserAvatar
                      email={r.candidate.email}
                      name={name}
                      avatarUrl={r.candidate.avatarUrl}
                      className="size-5 shrink-0"
                      fallbackClassName="text-[8px]"
                    />
                    <span className="hidden sm:block text-xs truncate max-w-24">{name}</span>
                    <Badge className={cn("text-[10px] shrink-0 border-0 tabular-nums", scoreTone(r.candidate.score))}>{r.candidate.score}%</Badge>
                  </button>
                )
              })}
            </div>
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
          <Button size="sm" className="gap-1.5" onClick={applyAll} disabled={applying || selectedCount === 0}>
            {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Assign{selectedCount > 0 ? ` ${selectedCount}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
