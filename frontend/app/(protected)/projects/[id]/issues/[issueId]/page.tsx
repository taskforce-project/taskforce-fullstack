"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ChevronRight,
  CircleDot,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  Calendar,
  Tag,
  User,
  RefreshCw,
  Paperclip,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IssueStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled"
type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"

interface ActivityItem {
  id: string
  type: "comment" | "status_change" | "assignment" | "label_added"
  author: { name: string; initials: string; color: string }
  content?: string
  meta?: string
  createdAt: string
}

interface IssueDetail {
  id: string
  identifier: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  labels: string[]
  assignee: { name: string; initials: string; color: string } | null
  dueDate: string | null
  cycle: string | null
  createdAt: string
  updatedAt: string
  storyPoints: number | null
  activity: ActivityItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<IssueStatus, { icon: React.ReactNode; label: string; badgeClass: string }> = {
  todo: {
    icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />,
    label: "Todo",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  in_progress: {
    icon: <RefreshCw className="h-3.5 w-3.5 text-blue-400" />,
    label: "In Progress",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  in_review: {
    icon: <ArrowUpRight className="h-3.5 w-3.5 text-amber-400" />,
    label: "In Review",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
  done: {
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
    label: "Done",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  cancelled: {
    icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    label: "Cancelled",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
}

const PRIORITY_CONFIG: Record<IssuePriority, { label: string; dotClass: string }> = {
  urgent: { label: "Urgent", dotClass: "bg-red-500" },
  high: { label: "High", dotClass: "bg-orange-400" },
  medium: { label: "Medium", dotClass: "bg-amber-400" },
  low: { label: "Low", dotClass: "bg-blue-400" },
  none: { label: "No priority", dotClass: "bg-muted-foreground" },
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_ISSUE: IssueDetail = {
  id: "1",
  identifier: "TF-001",
  title: "Implement JWT refresh token rotation",
  description: `Implement automatic refresh token rotation to improve security posture.

When a refresh token is used to obtain a new access token, the old refresh token should be invalidated and a new one issued. This prevents token reuse attacks.

## Requirements

- On each use of a refresh token, issue a new refresh token and invalidate the old one
- Store refresh tokens in an httpOnly cookie, not localStorage
- Implement a 7-day sliding expiry window
- Detect and reject reuse of invalidated tokens (possible token theft indicator)

## Acceptance Criteria

- [ ] Old refresh token is revoked on each use
- [ ] New refresh token is issued with each access token refresh
- [ ] Reuse of a revoked token invalidates the entire session
- [ ] All existing tests pass`,
  status: "in_progress",
  priority: "high",
  labels: ["security", "auth", "backend"],
  assignee: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
  dueDate: "Apr 15, 2026",
  cycle: "Sprint 3",
  createdAt: "Feb 14, 2026",
  updatedAt: "Mar 12, 2026",
  storyPoints: 5,
  activity: [
    {
      id: "a1",
      type: "assignment",
      author: { name: "You", initials: "ME", color: "bg-primary" },
      meta: "assigned Sophie Martin",
      createdAt: "Feb 14",
    },
    {
      id: "a2",
      type: "label_added",
      author: { name: "You", initials: "ME", color: "bg-primary" },
      meta: "added label security",
      createdAt: "Feb 14",
    },
    {
      id: "a3",
      type: "status_change",
      author: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
      meta: "changed status from Todo → In Progress",
      createdAt: "Mar 8",
    },
    {
      id: "a4",
      type: "comment",
      author: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
      content: "Starting implementation. I'll use Redis to store the revocation list. Should be ready for review by end of week.",
      createdAt: "Mar 8",
    },
    {
      id: "a5",
      type: "comment",
      author: { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
      content: "Good call on Redis. Make sure to set a TTL matching the max token lifetime so the store doesn't grow unbounded.",
      createdAt: "Mar 9",
    },
  ],
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SidebarSection({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </div>
  )
}

function ActivityEntry({ item }: { readonly item: ActivityItem }) {
  return (
    <div className="flex gap-3">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className={cn("text-[10px] text-white font-medium", item.author.color)}>
          {item.author.initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        {item.type === "comment" ? (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-foreground">{item.author.name}</span>
              <span className="text-xs text-muted-foreground">{item.createdAt}</span>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground leading-relaxed">
              {item.content}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1">
            <span className="text-xs font-medium text-foreground">{item.author.name}</span>
            <span className="text-xs text-muted-foreground">{item.meta}</span>
            <span className="text-xs text-muted-foreground ml-auto">{item.createdAt}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IssueDetailPage() {
  const params = useParams()
  const [commentValue, setCommentValue] = useState("")

  let projectId = "1"
  if (typeof params.id === "string") projectId = params.id

  const issue = MOCK_ISSUE
  const status = STATUS_CONFIG[issue.status]
  const priority = PRIORITY_CONFIG[issue.priority]

  return (
    <div className="flex flex-col gap-0 max-w-5xl mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/projects/${projectId}`} className="hover:text-foreground transition-colors">
          🚀 Frontend v2
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium font-mono">{issue.identifier}</span>
      </nav>

      <div className="flex gap-6 items-start">
        {/* ----------------------------------------------------------------
          Main content
        ---------------------------------------------------------------- */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

          {/* Header */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <h1 className="flex-1 text-xl font-semibold text-foreground leading-snug">
                {issue.title}
              </h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Delete issue
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Quick meta row */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("flex items-center gap-1.5 text-xs border px-2 py-0.5", status.badgeClass)}>
                {status.icon}
                {status.label}
              </Badge>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={cn("h-2 w-2 rounded-full", priority.dotClass)} />
                {priority.label}
              </div>
              {issue.labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-muted/60 text-muted-foreground border-0 font-normal">
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)]">
              <div
                className="prose prose-sm prose-invert max-w-none text-sm text-foreground leading-relaxed"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {issue.description}
              </div>
            </div>
          </div>

          {/* Attachments stub */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Attachments</span>
            </div>
            <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              Drop files here or click to attach
            </div>
          </div>

          <Separator />

          {/* Activity */}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">Activity</h2>
            <div className="flex flex-col gap-3">
              {issue.activity.map((item) => (
                <ActivityEntry key={item.id} item={item} />
              ))}
            </div>

            {/* Comment input */}
            <div className="flex gap-3 mt-2">
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarFallback className="text-[10px] text-white font-medium bg-primary">ME</AvatarFallback>
              </Avatar>
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[80px]"
                  placeholder="Add a comment…"
                  value={commentValue}
                  onChange={(e) => setCommentValue(e.target.value)}
                />
                {commentValue.trim() && (
                  <div className="flex justify-end">
                    <Button size="sm" className="h-8 text-xs" onClick={() => setCommentValue("")}>
                      Comment
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------
          Sidebar
        ---------------------------------------------------------------- */}
        <aside className="w-56 shrink-0 flex flex-col gap-5 sticky top-32">
          <SidebarSection label="Status">
            <div className={cn("flex items-center gap-2 text-sm rounded-md border px-2.5 py-1.5", status.badgeClass)}>
              {status.icon}
              {status.label}
            </div>
          </SidebarSection>

          <SidebarSection label="Priority">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", priority.dotClass)} />
              {priority.label}
            </div>
          </SidebarSection>

          <SidebarSection label="Assignee">
            {issue.assignee ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={cn("text-[9px] text-white font-medium", issue.assignee.color)}>
                    {issue.assignee.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-foreground">{issue.assignee.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                Unassigned
              </div>
            )}
          </SidebarSection>

          <SidebarSection label="Due date">
            {issue.dueDate ? (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {issue.dueDate}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No due date</span>
            )}
          </SidebarSection>

          <SidebarSection label="Labels">
            {issue.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    {label}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No labels</span>
            )}
          </SidebarSection>

          {issue.cycle && (
            <SidebarSection label="Cycle">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                {issue.cycle}
              </div>
            </SidebarSection>
          )}

          {issue.storyPoints !== null && (
            <SidebarSection label="Story points">
              <span className="text-sm font-medium text-foreground">{issue.storyPoints} pts</span>
            </SidebarSection>
          )}

          <Separator />

          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Created {issue.createdAt}</span>
            <span>Updated {issue.updatedAt}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
