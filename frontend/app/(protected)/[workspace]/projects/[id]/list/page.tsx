"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import {
  CircleDot,
  RefreshCw,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  AlertTriangle,
  Plus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus = "todo" | "in_progress" | "in_review" | "done"

interface ListIssue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  status: IssueStatus
  assignee: { initials: string; color: string } | null
  labels: string[]
  dueDate: string | null
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
  none: "bg-muted-foreground/30",
}

const STATUS_ICON: Record<IssueStatus, React.ReactNode> = {
  todo: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />,
  in_progress: <RefreshCw className="h-3.5 w-3.5 text-blue-400" />,
  in_review: <Clock className="h-3.5 w-3.5 text-yellow-400" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
}

const ALL_ISSUES: ListIssue[] = [
  { id: "1", identifier: "TF-41", title: "Update hero section copy", priority: "high", status: "todo", assignee: { initials: "ME", color: "bg-primary" }, labels: ["copy"], dueDate: "Mar 31" },
  { id: "2", identifier: "TF-44", title: "Add social proof section with testimonials", priority: "medium", status: "todo", assignee: null, labels: ["design"], dueDate: null },
  { id: "3", identifier: "TF-29", title: "Implement dark mode toggle", priority: "low", status: "in_progress", assignee: { initials: "ME", color: "bg-primary" }, labels: ["ui"], dueDate: "Apr 2" },
  { id: "4", identifier: "TF-32", title: "Responsive navigation redesign", priority: "high", status: "in_progress", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["ui", "mobile"], dueDate: "Apr 1" },
  { id: "5", identifier: "TF-38", title: "SEO meta tags refactor", priority: "medium", status: "in_progress", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["seo"], dueDate: null },
  { id: "6", identifier: "TF-22", title: "Analytics integration with Plausible", priority: "medium", status: "in_review", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["analytics"], dueDate: "Mar 30" },
  { id: "7", identifier: "TF-25", title: "Accessibility audit — WCAG 2.1 AA", priority: "high", status: "in_review", assignee: { initials: "ME", color: "bg-primary" }, labels: ["a11y"], dueDate: "Overdue" },
  { id: "8", identifier: "TF-11", title: "Set up Next.js 15 project", priority: "none", status: "done", assignee: { initials: "ME", color: "bg-primary" }, labels: [], dueDate: null },
  { id: "9", identifier: "TF-12", title: "Design system tokens", priority: "none", status: "done", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["design"], dueDate: null },
  { id: "10", identifier: "TF-17", title: "SEO audit & initial fixes", priority: "none", status: "done", assignee: { initials: "ME", color: "bg-primary" }, labels: ["seo"], dueDate: null },
]

export default function ProjectListPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
        <div className="w-3.5 shrink-0" />
        <div className="w-3.5 shrink-0" />
        <div className="w-14 shrink-0">ID</div>
        <div className="flex-1">Title</div>
        <div className="hidden sm:block w-24 text-right">Status</div>
        <div className="hidden md:block w-28 text-right">Labels</div>
        <div className="hidden md:block w-20 text-right">Due</div>
        <div className="hidden lg:block w-8" />
        <div className="w-3.5 shrink-0" />
      </div>

      {ALL_ISSUES.map((issue) => {
        const isOverdue = issue.dueDate === "Overdue"
        return (
          <Link
            key={issue.id}
            href={`/projects/${projectId}/issues/${issue.identifier.toLowerCase().replace("-", "")}`}
            className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
          >
            <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
            <div className="shrink-0">{STATUS_ICON[issue.status]}</div>
            <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.identifier}</span>
            <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">{issue.title}</span>
            <span className="hidden sm:block text-xs text-muted-foreground w-24 text-right capitalize">{issue.status.replace("_", " ")}</span>
            <div className="hidden md:flex gap-1 w-28 justify-end">
              {issue.labels.slice(0, 2).map((l) => (
                <Badge key={l} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">{l}</Badge>
              ))}
            </div>
            <span className={cn("hidden md:block text-xs w-20 text-right shrink-0", isOverdue ? "text-red-400 font-medium" : "text-muted-foreground")}>
              {isOverdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
              {issue.dueDate ?? "—"}
            </span>
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
        )
      })}

      {/* Add issue row */}
      <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:bg-muted/20 transition-colors cursor-pointer">
        <Plus className="h-3.5 w-3.5" />
        <span className="text-xs">Add issue</span>
      </div>
    </div>
  )
}
