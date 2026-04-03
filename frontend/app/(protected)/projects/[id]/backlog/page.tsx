"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import {
  CircleDot,
  Plus,
  ArrowUpRight,
  GripVertical,
} from "lucide-react"


import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"

interface BacklogIssue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  assignee: { initials: string; color: string } | null
  labels: string[]
  points: number | null
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
  none: "bg-muted-foreground/30",
}

const BACKLOG_ISSUES: BacklogIssue[] = [
  { id: "1", identifier: "TF-47", title: "Implement cookie consent banner", priority: "low", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["legal"], points: 3 },
  { id: "2", identifier: "TF-51", title: "Optimize images with next/image", priority: "medium", assignee: null, labels: ["perf"], points: 2 },
  { id: "3", identifier: "TF-54", title: "Add blog section with MDX content", priority: "medium", assignee: null, labels: ["content"], points: 8 },
  { id: "4", identifier: "TF-58", title: "Integrate Intercom chat widget", priority: "low", assignee: null, labels: ["integrations"], points: 5 },
  { id: "5", identifier: "TF-62", title: "Build pricing comparison table", priority: "high", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["ui", "pricing"], points: 5 },
  { id: "6", identifier: "TF-65", title: "Email notification templates", priority: "medium", assignee: null, labels: ["email"], points: null },
  { id: "7", identifier: "TF-68", title: "A/B test hero section variants", priority: "low", assignee: null, labels: ["growth", "analytics"], points: null },
  { id: "8", identifier: "TF-71", title: "Redesign 404 error page", priority: "low", assignee: null, labels: ["ui"], points: 1 },
  { id: "9", identifier: "TF-74", title: "Add structured data (JSON-LD) for SEO", priority: "medium", assignee: { initials: "ME", color: "bg-primary" }, labels: ["seo"], points: 2 },
  { id: "10", identifier: "TF-77", title: "Setup Storybook for component documentation", priority: "low", assignee: null, labels: ["dev"], points: null },
]

export default function ProjectBacklogPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"
  const totalPoints = BACKLOG_ISSUES.reduce((sum, i) => sum + (i.points ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span><span className="font-medium text-foreground">{BACKLOG_ISSUES.length}</span> issues</span>
        <span>·</span>
        <span><span className="font-medium text-foreground">{totalPoints}</span> story points estimated</span>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {BACKLOG_ISSUES.map((issue) => (
          <Link
            key={issue.id}
            href={`/projects/${projectId}/issues/${issue.identifier.toLowerCase().replace("-", "")}`}
            className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
          >
            {/* Drag handle hint */}
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />

            <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
            <CircleDot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>
            <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">{issue.title}</span>

            <div className="hidden md:flex gap-1">
              {issue.labels.slice(0, 2).map((l) => (
                <Badge key={l} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">{l}</Badge>
              ))}
            </div>

            {issue.points !== null && (
              <span className="hidden sm:block text-xs text-muted-foreground font-medium bg-muted rounded px-1.5 py-0.5">
                {issue.points} pts
              </span>
            )}

            <div className="hidden lg:flex items-center justify-center w-8">
              {issue.assignee && (
                <Avatar className="h-5 w-5">
                  <AvatarFallback className={cn("text-[9px] text-white", issue.assignee.color)}>
                    {issue.assignee.initials}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
        ))}

        <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer">
          <Plus className="h-3.5 w-3.5" />
          <span className="text-xs">Add to backlog</span>
        </div>
      </div>
    </div>
  )
}
