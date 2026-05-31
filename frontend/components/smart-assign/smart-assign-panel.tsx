"use client"

import { useState } from "react"
import { Sparkles, Loader2, Check, X, ChevronDown, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { IssuePriority } from "@/components/sheets/issue-sheet"
import {
  smartAssignIssue,
  type SmartAssignCandidate,
  type SmartAssignResult,
} from "@/lib/api/issue-service"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SmartAssignProps {
  workspaceSlug: string
  projectId: number
  issueId: number
  issueLabels: string[]
  issuePriority: IssuePriority
  currentAssignee: { userId: number; name: string; initials: string; color: string } | null
  onAssign: (member: SmartAssignCandidate) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkloadBar
// ─────────────────────────────────────────────────────────────────────────────

function getBarColor(value: number): string {
  if (value >= 70) return "bg-emerald-500"
  if (value >= 40) return "bg-amber-400"
  return "bg-red-400"
}

function WorkloadBar({ value }: Readonly<{ value: number }>) {
  const color = getBarColor(value)
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-7 text-right">{value}%</span>
    </div>
  )
}

function initialsFromCandidate(c: SmartAssignCandidate): string {
  const base = c.displayName?.trim() || c.email
  return base.slice(0, 2).toUpperCase()
}

function colorFromUserId(userId: number): string {
  const colors = [
    "bg-violet-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-amber-500",
    "bg-indigo-500",
  ]
  return colors[userId % colors.length]
}

// ─────────────────────────────────────────────────────────────────────────────
// SmartAssignPanel
// ─────────────────────────────────────────────────────────────────────────────

export function SmartAssignPanel({
  workspaceSlug,
  projectId,
  issueId,
  issueLabels,
  issuePriority,
  currentAssignee,
  onAssign,
}: Readonly<SmartAssignProps>) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [result, setResult] = useState<SmartAssignResult | null>(null)

  const top = result?.recommended ?? null
  const rest = result?.alternatives ?? []

  async function handleAnalyze() {
    setLoading(true)
    setRan(false)
    try {
      const data = await smartAssignIssue(workspaceSlug, projectId, issueId)
      setResult(data)
      setRan(true)
      if (!data.recommended) {
        toast.warning("Aucune recommandation disponible pour cette issue")
      }
    } catch {
      toast.error("Impossible de générer Smart Assign")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm(member: SmartAssignCandidate) {
    onAssign(member)
    setOpen(false)
    setRan(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-dashed border-border mt-1 w-full"
      >
        <Sparkles className="size-3 text-primary/70" />
        Smart assign
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-primary" />
          <span className="text-[11px] font-semibold text-foreground">Smart Assign</span>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setRan(false); setLoading(false) }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="px-3 py-3 flex flex-col gap-3">
        {/* Context chips */}
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-muted/60 border-0 text-muted-foreground">
            priority:{issuePriority.toLowerCase()}
          </Badge>
          {issueLabels.length > 0
            ? issueLabels.map((l) => (
                <Badge key={l} variant="secondary" className="text-[9px] h-4 px-1.5 bg-muted/60 border-0 text-muted-foreground">
                  {l}
                </Badge>
              ))
            : <span className="text-[10px] text-muted-foreground italic">No labels — analysis based on workload & availability</span>
          }
        </div>

        {/* Analyze button */}
        {!ran && (
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5 w-full"
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Analyzing team…
              </>
            ) : (
              <>
                <Sparkles className="size-3" />
                Find best match
              </>
            )}
          </Button>
        )}

        {/* Results */}
        {ran && top && (
          <div className="flex flex-col gap-2">
            {/* Top recommendation */}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 flex flex-col gap-2">
              <div className="flex items-center gap-2 justify-between">
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Best match</span>
                <span className="text-[10px] font-bold text-primary">{top.score}%</span>
              </div>

              <div className="flex items-center gap-2">
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className={cn("text-[9px] text-white", colorFromUserId(top.userId))}>
                    {initialsFromCandidate(top)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{top.displayName ?? top.email}</p>
                  <p className="text-[10px] text-muted-foreground">semantic {top.semanticScore}% · history {top.historicalScore}%</p>
                </div>
              </div>

              {/* Availability bar */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Availability</p>
                <WorkloadBar value={top.availability} />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">{top.openIssues} open issues</span>
                {top.factors.map((f) => (
                  <Badge key={f} variant="outline" className="text-[9px] h-3.5 px-1 border-primary/20 text-primary/70">{f}</Badge>
                ))}
              </div>

              {currentAssignee?.userId === top.userId ? (
                <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <Check className="size-3" />
                  Already assigned
                </div>
              ) : (
                <Button size="sm" className="h-6 text-[10px] gap-1 mt-0.5" onClick={() => handleConfirm(top)}>
                  <Check className="size-3" />
                  Assign {(top.displayName ?? top.email).split(" ")[0]}
                </Button>
              )}
            </div>

            {/* Other candidates */}
            {rest.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full py-0.5 transition-colors"
                >
                  <ChevronDown className={cn("size-3 transition-transform", showAll && "rotate-180")} />
                  {showAll ? "Hide" : "Show"} other candidates
                </button>

                {showAll && (
                  <div className="flex flex-col gap-1.5 mt-1.5">
                    {rest.map((candidate) => (
                      <button
                        key={candidate.userId}
                        type="button"
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors cursor-pointer group w-full text-left"
                        onClick={() => handleConfirm(candidate)}
                      >
                        <Avatar className="size-5 shrink-0">
                          <AvatarFallback className={cn("text-[8px] text-white", colorFromUserId(candidate.userId))}>
                            {initialsFromCandidate(candidate)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-foreground truncate">{candidate.displayName ?? candidate.email}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {candidate.factors.slice(0, 2).map((f) => (
                              <span key={f} className="text-[9px] text-muted-foreground">{f}</span>
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground shrink-0 group-hover:text-foreground">{candidate.score}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result?.fallbackUsed && (
              <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
                <AlertCircle className="size-3 shrink-0 mt-0.5" />
                AI fallback active — recommendation generated from Java rules.
              </div>
            )}

            {/* No skills warning */}
            {issueLabels.length === 0 && (
              <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
                <AlertCircle className="size-3 shrink-0 mt-0.5" />
                Add labels to this issue for a more accurate skill-based recommendation.
              </div>
            )}

            <button
              type="button"
              onClick={() => { setRan(false); setShowAll(false) }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              Re-analyze
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
