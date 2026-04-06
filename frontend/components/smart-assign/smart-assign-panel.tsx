"use client"

import { useState, useMemo } from "react"
import { Sparkles, Loader2, Check, X, ChevronDown, AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { IssuePriority } from "@/components/sheets/issue-sheet"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamMemberProfile {
  initials: string
  color: string
  name: string
  role: string
  skills: string[]
  openIssues: number    // current workload
  availability: number  // 0-100% free capacity
}

interface SmartAssignProps {
  issueLabels: string[]
  issuePriority: IssuePriority
  currentAssignee: { name: string; initials: string; color: string } | null
  onAssign: (member: TeamMemberProfile) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock team with skills & workload
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_PROFILES: TeamMemberProfile[] = [
  {
    name: "Sophie Martin",
    initials: "SM",
    color: "bg-violet-500",
    role: "Frontend Engineer",
    skills: ["react", "typescript", "ui", "design", "ux", "css", "feature"],
    openIssues: 4,
    availability: 60,
  },
  {
    name: "Emma Petit",
    initials: "EP",
    color: "bg-emerald-500",
    role: "Full-stack Engineer",
    skills: ["react", "typescript", "backend", "api", "test", "feature", "ux", "mobile"],
    openIssues: 3,
    availability: 75,
  },
  {
    name: "Thomas Bernard",
    initials: "TB",
    color: "bg-orange-500",
    role: "Backend Engineer",
    skills: ["java", "backend", "api", "db", "performance", "security", "devops", "monitoring"],
    openIssues: 6,
    availability: 35,
  },
  {
    name: "Lucas Dufour",
    initials: "LD",
    color: "bg-blue-500",
    role: "DevOps / SRE",
    skills: ["devops", "monitoring", "ci", "docker", "security", "performance", "db"],
    openIssues: 2,
    availability: 85,
  },
  {
    name: "You",
    initials: "ME",
    color: "bg-primary",
    role: "Lead Engineer",
    skills: ["react", "typescript", "java", "backend", "api", "security", "auth", "feature", "bug"],
    openIssues: 5,
    availability: 50,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Scoring algorithm
// ─────────────────────────────────────────────────────────────────────────────

interface ScoredMember {
  member: TeamMemberProfile
  score: number              // 0-100
  skillMatch: number         // matched labels count
  factors: string[]
}

function scoreMembers(
  members: TeamMemberProfile[],
  labels: string[],
  priority: IssuePriority
): ScoredMember[] {
  const PRIORITY_WEIGHT: Record<IssuePriority, number> = {
    urgent: 0.4,
    high:   0.3,
    medium: 0.2,
    low:    0.1,
    none:   0.1,
  }

  const priorityWeight = PRIORITY_WEIGHT[priority]

  return members
    .map((member) => {
      const normalizedLabels = labels.map((l) => l.toLowerCase())
      const matchedSkills = normalizedLabels.filter((l) => member.skills.includes(l))
      const skillScore = normalizedLabels.length > 0
        ? (matchedSkills.length / normalizedLabels.length) * 100
        : 50 // no labels → neutral

      // Workload: fewer open issues = better
      const workloadScore = Math.max(0, 100 - member.openIssues * 10)

      // Availability
      const availabilityScore = member.availability

      // Weighted sum — for urgent issues, availability matters more
      const score =
        skillScore * 0.45 +
        workloadScore * (0.3 - priorityWeight * 0.1) +
        availabilityScore * (0.25 + priorityWeight * 0.1)

      const factors: string[] = []
      if (matchedSkills.length > 0) factors.push(`${matchedSkills.length} skill match${matchedSkills.length > 1 ? "es" : ""}`)
      if (member.availability >= 70) factors.push("High availability")
      else if (member.availability < 40) factors.push("Low availability")
      if (member.openIssues <= 2) factors.push("Low workload")
      else if (member.openIssues >= 6) factors.push("High workload")

      return { member, score: Math.round(score), skillMatch: matchedSkills.length, factors }
    })
    .sort((a, b) => b.score - a.score)
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

// ─────────────────────────────────────────────────────────────────────────────
// SmartAssignPanel
// ─────────────────────────────────────────────────────────────────────────────

export function SmartAssignPanel({
  issueLabels,
  issuePriority,
  currentAssignee,
  onAssign,
}: Readonly<SmartAssignProps>) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const scored = useMemo(
    () => scoreMembers(TEAM_PROFILES, issueLabels, issuePriority),
    [issueLabels, issuePriority]
  )

  const top = scored[0]
  const rest = scored.slice(1)

  function handleAnalyze() {
    setLoading(true)
    setRan(false)
    setTimeout(() => {
      setLoading(false)
      setRan(true)
    }, 1200)
  }

  function handleConfirm(member: TeamMemberProfile) {
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
                  <AvatarFallback className={cn("text-[9px] text-white", top.member.color)}>
                    {top.member.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{top.member.name}</p>
                  <p className="text-[10px] text-muted-foreground">{top.member.role}</p>
                </div>
              </div>

              {/* Availability bar */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Availability</p>
                <WorkloadBar value={top.member.availability} />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">{top.member.openIssues} open issues</span>
                {top.factors.map((f) => (
                  <Badge key={f} variant="outline" className="text-[9px] h-3.5 px-1 border-primary/20 text-primary/70">{f}</Badge>
                ))}
              </div>

              {currentAssignee?.name === top.member.name ? (
                <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <Check className="size-3" />
                  Already assigned
                </div>
              ) : (
                <Button size="sm" className="h-6 text-[10px] gap-1 mt-0.5" onClick={() => handleConfirm(top.member)}>
                  <Check className="size-3" />
                  Assign {top.member.name.split(" ")[0]}
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
                    {rest.map(({ member, score, factors }) => (
                      <button
                        key={member.name}
                        type="button"
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors cursor-pointer group w-full text-left"
                        onClick={() => handleConfirm(member)}
                      >
                        <Avatar className="size-5 shrink-0">
                          <AvatarFallback className={cn("text-[8px] text-white", member.color)}>
                            {member.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-foreground truncate">{member.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {factors.slice(0, 2).map((f) => (
                              <span key={f} className="text-[9px] text-muted-foreground">{f}</span>
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground shrink-0 group-hover:text-foreground">{score}%</span>
                      </button>
                    ))}
                  </div>
                )}
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
