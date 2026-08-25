"use client"

import { useState } from "react"
import { Scale, Loader2, Check, ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import {
  previewRedistribution,
  applyRedistribution,
  type RedistributionMove,
} from "@/lib/api/redistribution-service"

interface Row extends RedistributionMove {
  selected: boolean
}

/** Messages du loader (même moteur que Smart Assign : compétences / charge / dispo). */
const REDISTRIBUTION_PHASES = [
  "Reading current assignments…",
  "Weighing each workload…",
  "Calculating availability…",
  "Finding the best balance…",
]

interface RedistributionDialogProps {
  readonly slug: string
  /** Limite le plan à un membre surchargé (optionnel). */
  readonly targetUserId?: number
  /** Rendu du déclencheur (bouton). Si absent, un bouton par défaut est affiché. */
  readonly trigger?: React.ReactNode
  /** Appelé après application réussie (pour rafraîchir la vue appelante). */
  readonly onApplied?: () => void
}

/**
 * Redistribution proposée validée par le manager (PROD-1.12, trou CDC #4).
 * Ouvre → calcule un plan (preview) → le manager décoche ce qu'il refuse → applique.
 */
export function RedistributionDialog({ slug, targetUserId, trigger, onApplied }: RedistributionDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [ran, setRan] = useState(false)
  const [threshold, setThreshold] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  const selectedCount = rows.filter((r) => r.selected).length

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) { setRows([]); setRan(false); return }

    setLoading(true)
    setRan(false)
    try {
      const plan = await previewRedistribution(slug, targetUserId)
      setThreshold(plan.threshold)
      setRows(plan.moves.map((m) => ({ ...m, selected: true })))
      setRan(true)
      if (plan.moves.length === 0) {
        toast.info("No redistribution needed — nobody is overloaded.")
      }
    } catch {
      toast.error("Could not compute the redistribution")
    } finally {
      setLoading(false)
    }
  }

  function toggle(issueId: number) {
    setRows((rs) => rs.map((r) => (r.issueId === issueId ? { ...r, selected: !r.selected } : r)))
  }

  async function apply() {
    const selected = rows.filter((r) => r.selected)
    if (selected.length === 0) return
    setApplying(true)
    try {
      const result = await applyRedistribution(
        slug,
        selected.map((r) => ({ issueId: r.issueId, toUserId: r.toUserId }))
      )
      toast.success(
        `${result.applied} task${result.applied > 1 ? "s" : ""} redistributed${result.applied > 1 ? "" : ""}` +
          (result.skipped > 0 ? ` · ${result.skipped} skipped` : "")
      )
      setOpen(false)
      setRows([])
      setRan(false)
      onApplied?.()
    } catch {
      toast.error("Redistribution failed")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Scale className="size-3.5" />
            Rebalance the load
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="size-4 text-primary" /> Suggested redistribution
          </DialogTitle>
          <DialogDescription>
            {threshold != null
              ? `Members above ${threshold} open tasks. Uncheck what you don't want to move, then confirm.`
              : "Suggested moves to rebalance workloads. You approve or reject."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <ShimmerLoader phrases={REDISTRIBUTION_PHASES} className="text-xs" />
          </div>
        ) : ran && rows.length > 0 ? (
          <div className="flex flex-col gap-1 max-h-[55vh] overflow-y-auto">
            {rows.map((r) => (
              <button
                key={r.issueId}
                type="button"
                onClick={() => toggle(r.issueId)}
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
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs">{r.issueTitle}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="truncate">{r.fromName}</span>
                    <ArrowRight className="size-2.5 shrink-0" />
                    <span className="truncate font-medium text-foreground">{r.toName}</span>
                    <span className="truncate">· {r.projectName}</span>
                  </span>
                </span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{r.toScore}%</Badge>
              </button>
            ))}
          </div>
        ) : ran ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing to redistribute — workloads are balanced. 👍
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={apply} disabled={applying || selectedCount === 0}>
            {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Apply{selectedCount > 0 ? ` ${selectedCount}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
