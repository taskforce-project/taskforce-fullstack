"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import {
  CircleDot,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  MoreHorizontal,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types & mock data
// ---------------------------------------------------------------------------

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus = "todo" | "in_progress" | "in_review" | "done"

interface BoardIssue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  assignee: { initials: string; color: string } | null
  labels: string[]
}

interface BoardColumn {
  id: IssueStatus
  title: string
  icon: React.ReactNode
  color: string
  issues: BoardIssue[]
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
  none: "bg-muted-foreground/30",
}

const BOARDS: Record<string, BoardColumn[]> = {
  default: [
    {
      id: "todo",
      title: "To Do",
      icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />,
      color: "text-muted-foreground",
      issues: [
        { id: "t1", identifier: "TF-41", title: "Update hero section copy", priority: "high", assignee: { initials: "ME", color: "bg-primary" }, labels: ["copy"] },
        { id: "t2", identifier: "TF-44", title: "Add social proof section with testimonials", priority: "medium", assignee: null, labels: ["design"] },
        { id: "t3", identifier: "TF-47", title: "Implement cookie consent banner", priority: "low", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["legal"] },
        { id: "t4", identifier: "TF-51", title: "Optimize images with next/image", priority: "medium", assignee: null, labels: ["perf"] },
      ],
    },
    {
      id: "in_progress",
      title: "In Progress",
      icon: <RefreshCw className="h-3.5 w-3.5 text-blue-400" />,
      color: "text-blue-400",
      issues: [
        { id: "p1", identifier: "TF-29", title: "Implement dark mode toggle", priority: "low", assignee: { initials: "ME", color: "bg-primary" }, labels: ["ui"] },
        { id: "p2", identifier: "TF-32", title: "Responsive navigation redesign", priority: "high", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["ui", "mobile"] },
        { id: "p3", identifier: "TF-38", title: "SEO meta tags refactor", priority: "medium", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["seo"] },
      ],
    },
    {
      id: "in_review",
      title: "In Review",
      icon: <Clock className="h-3.5 w-3.5 text-yellow-400" />,
      color: "text-yellow-400",
      issues: [
        { id: "r1", identifier: "TF-22", title: "Analytics integration with Plausible", priority: "medium", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["analytics"] },
        { id: "r2", identifier: "TF-25", title: "Accessibility audit — WCAG 2.1 AA", priority: "high", assignee: { initials: "ME", color: "bg-primary" }, labels: ["a11y"] },
      ],
    },
    {
      id: "done",
      title: "Done",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
      color: "text-emerald-400",
      issues: [
        { id: "d1", identifier: "TF-11", title: "Set up Next.js 15 project", priority: "none", assignee: { initials: "ME", color: "bg-primary" }, labels: [] },
        { id: "d2", identifier: "TF-12", title: "Design system tokens (colors, typography)", priority: "none", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["design"] },
        { id: "d3", identifier: "TF-14", title: "CI/CD pipeline with GitHub Actions", priority: "none", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["devops"] },
        { id: "d4", identifier: "TF-17", title: "SEO audit & initial fixes", priority: "none", assignee: { initials: "ME", color: "bg-primary" }, labels: ["seo"] },
        { id: "d5", identifier: "TF-19", title: "Privacy policy & terms pages", priority: "none", assignee: null, labels: ["legal"] },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// IssueCard component
// ---------------------------------------------------------------------------

function IssueCard({ issue, projectId }: { readonly issue: BoardIssue; readonly projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/issues/${issue.identifier.toLowerCase().replace("-", "")}`}
      className="group block rounded-lg border border-border bg-background p-3 hover:border-primary/40 hover:bg-muted/20 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)] cursor-pointer"
    >
      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {issue.labels.map((label) => (
            <Badge
              key={label}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 bg-muted/60 text-muted-foreground border-0 font-normal"
            >
              {label}
            </Badge>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm text-foreground leading-snug mb-3 group-hover:text-primary transition-colors line-clamp-2">
        {issue.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
          <span className="text-[11px] text-muted-foreground font-mono">{issue.identifier}</span>
        </div>
        {issue.assignee && (
          <Avatar className="h-5 w-5">
            <AvatarFallback className={cn("text-[9px] text-white", issue.assignee.color)}>
              {issue.assignee.initials}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Column component
// ---------------------------------------------------------------------------

function BoardColumnView({ column, projectId, t }: { readonly column: BoardColumn; readonly projectId: string; readonly t: (k: string) => string }) {
  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          {column.icon}
          <span className={cn("text-sm font-medium", column.color)}>{column.title}</span>
          <Badge
            variant="secondary"
            className="h-5 min-w-5 px-1.5 text-xs bg-muted text-muted-foreground border-0"
          >
            {column.issues.length}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-60 hover:opacity-100">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-24">
        {column.issues.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">{t("projects.detail.noIssues")}</p>
          </div>
        ) : (
          column.issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} projectId={projectId} />
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board page
// ---------------------------------------------------------------------------

export default function ProjectBoardPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"

  const columns = BOARDS["default"]

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Filters
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <MoreHorizontal className="h-3.5 w-3.5" />
            Group by
          </Button>
        </div>
        <p className="text-xs text-muted-foreground hidden md:block">
          Drag & drop coming soon — dnd-kit integration pending
        </p>
      </div>

      {/* Board columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 md:-mx-6 px-4 md:px-6">
        {columns.map((col) => (
          <BoardColumnView key={col.id} column={col} projectId={projectId} t={t} />
        ))}
      </div>
    </div>
  )
}
