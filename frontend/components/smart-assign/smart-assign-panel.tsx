"use client"

import { useState, useEffect, useRef } from "react"
import { Sparkles, Loader2, Check, X, ChevronDown, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { TextShimmerWave } from "@/components/ui/text-shimmer-wave"
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
  /** Ouverture contrôlée par le parent (l'étoile IA vit dans la ligne Assignee du sheet). */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Jeton incrémenté à chaque clic d'analyse ; toute nouvelle valeur (>0) relance l'analyse. */
  runToken?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkloadBar
// ─────────────────────────────────────────────────────────────────────────────

function getBarColor(value: number): string {
  // Bleu de référence pour un bon score ; seuils d'alerte amber/rose alignés sur la jauge d'usage IA (échelle inversée)
  if (value >= 70) return "bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300"
  if (value >= 40) return "bg-amber-500"
  return "bg-rose-500"
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

/** Ligne « label + barre » du breakdown de score. */
function LabeledBar({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <WorkloadBar value={value} />
    </div>
  )
}

/** « Pourquoi » : compétences qui matchent + explication en langage naturel. */
export function MatchReasoning({
  matchedSkills,
  reason,
}: Readonly<{ matchedSkills?: string[]; reason?: string | null }>) {
  const skills = matchedSkills ?? []
  if (skills.length === 0 && !reason) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-background/60 p-2">
      {skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Matches</span>
          {skills.map((s) => (
            <Badge key={s} className="h-4 px-1.5 text-[9px] bg-emerald-500/15 text-emerald-400 border-0">{s}</Badge>
          ))}
        </div>
      )}
      {reason && (
        <p className="text-[10px] leading-snug text-muted-foreground italic">“{reason}”</p>
      )}
    </div>
  )
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
  open,
  onOpenChange,
  runToken = 0,
}: Readonly<SmartAssignProps>) {
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [result, setResult] = useState<SmartAssignResult | null>(null)

  const top = result?.recommended ?? null
  const rest = result?.alternatives ?? []

  // Relance l'analyse quand le parent bump `runToken` (clic sur l'étoile IA). On passe par une ref
  // pour garder l'effet clé sur le seul jeton, sans redéclencher à chaque recréation de handleAnalyze.
  const analyzeRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (runToken > 0) void analyzeRef.current()
  }, [runToken])

  async function handleAnalyze() {
    setLoading(true)
    setRan(false)
    try {
      const data = await smartAssignIssue(workspaceSlug, projectId, issueId)
      setResult(data)
      setRan(true)
      if (!data.recommended) {
        toast.warning("No recommendation available for this issue")
      }
    } catch {
      toast.error("Could not generate Smart Assign")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }
  analyzeRef.current = handleAnalyze

  function handleConfirm(member: SmartAssignCandidate) {
    onAssign(member)
    onOpenChange(false)
    setRan(false)
  }

  // Le trigger (étoile IA) vit dans la ligne Assignee du sheet ; replié, le panneau ne rend rien.
  if (!open) return null

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
          onClick={() => { onOpenChange(false); setRan(false); setLoading(false) }}
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

        {/* Analyse en cours — retour immédiat au clic, pas de bouton à re-cliquer. */}
        {loading && (
          <div className="flex items-center justify-center gap-1.5 rounded-md bg-muted/40 px-2 py-2 text-xs">
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
            <TextShimmerWave as="span">Finding the best fit…</TextShimmerWave>
          </div>
        )}

        {/* Relance : seulement si l'analyse n'a rien donné (échec réseau, quota IA). */}
        {!loading && !ran && (
          <Button size="sm" className="h-7 w-full gap-1.5 text-xs" onClick={handleAnalyze}>
            <Sparkles className="size-3" />
            Find best match
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
                <UserAvatar
                  email={top.email}
                  name={top.displayName ?? top.email}
                  avatarUrl={top.avatarUrl}
                  className="size-6 shrink-0"
                  fallbackClassName="text-[9px]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{top.displayName ?? top.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {top.openIssues} open · {top.matchedSkills?.length ?? 0} skill match{(top.matchedSkills?.length ?? 0) === 1 ? "" : "es"}
                  </p>
                </div>
              </div>

              {/* Pourquoi : compétences qui matchent + explication en langage naturel */}
              <MatchReasoning matchedSkills={top.matchedSkills} reason={top.reason} />

              {/* Breakdown du score */}
              <div className="flex flex-col gap-1">
                <LabeledBar label="Semantic"  value={top.semanticScore} />
                <LabeledBar label="Workload"  value={top.workloadScore} />
                <LabeledBar label="Available"  value={top.availability} />
                {top.historicalScore > 0 && <LabeledBar label="History" value={top.historicalScore} />}
              </div>

              {top.factors.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {top.factors.map((f) => (
                    <Badge key={f} variant="outline" className="text-[9px] h-3.5 px-1 border-primary/20 text-primary/70">{f}</Badge>
                  ))}
                </div>
              )}

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
                        <UserAvatar
                          email={candidate.email}
                          name={candidate.displayName ?? candidate.email}
                          avatarUrl={candidate.avatarUrl}
                          className="size-5 shrink-0"
                          fallbackClassName="text-[8px]"
                        />
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

            {/* Relance directement l'analyse — même principe que le bouton d'entrée : une
                intention explicite ne doit pas retomber sur un second bouton. */}
            <button
              type="button"
              onClick={() => { setShowAll(false); void handleAnalyze() }}
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
