"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Plus,
  MessageSquare,
  ThumbsUp,
  Pin,
  Lock,
  MoreHorizontal,
  X,
  CheckCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiscussionCategory = "general" | "announcement" | "idea" | "question" | "show"
type DiscussionState = "open" | "answered" | "closed"
type FilterCategory = "all" | DiscussionCategory

interface Discussion {
  id: string
  title: string
  body: string
  category: DiscussionCategory
  state: DiscussionState
  author: { name: string; initials: string; color: string }
  replyCount: number
  reactionCount: number
  isPinned: boolean
  isLocked: boolean
  createdAt: string
  lastActivityAt: string
  tags: string[]
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<DiscussionCategory, { label: string; badgeClass: string; emoji: string }> = {
  general: { label: "General", badgeClass: "bg-muted text-muted-foreground border-border", emoji: "💬" },
  announcement: { label: "Announcement", badgeClass: "bg-primary/10 text-primary border-primary/20", emoji: "📣" },
  idea: { label: "Idea", badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20", emoji: "💡" },
  question: { label: "Question", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20", emoji: "❓" },
  show: { label: "Show & Tell", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", emoji: "✨" },
}

const FILTER_TABS: { key: FilterCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "idea", label: "Ideas" },
  { key: "question", label: "Questions" },
  { key: "show", label: "Show & Tell" },
  { key: "general", label: "General" },
]

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const DISCUSSIONS: Discussion[] = [
  {
    id: "1",
    title: "Taskforce v1.1 — Release notes & what's next",
    body: "We just shipped v1.1 with improved analytics, cycle management improvements, and a ton of performance optimizations. Here's a full breakdown of what changed and our Q2 roadmap.",
    category: "announcement",
    state: "open",
    author: { name: "You", initials: "ME", color: "bg-primary" },
    replyCount: 7,
    reactionCount: 12,
    isPinned: true,
    isLocked: false,
    createdAt: "Mar 28, 2026",
    lastActivityAt: "2 hours ago",
    tags: ["release", "roadmap"],
  },
  {
    id: "2",
    title: "Proposal: Replace PostgreSQL with CockroachDB for horizontal scaling",
    body: "As we plan for enterprise-scale workloads, I wanted to open a discussion on migrating from PostgreSQL to CockroachDB. Pros: native horizontal sharding, multi-region active-active. Cons: SQL dialect differences, migration complexity...",
    category: "idea",
    state: "open",
    author: { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
    replyCount: 14,
    reactionCount: 6,
    isPinned: false,
    isLocked: false,
    createdAt: "Mar 25, 2026",
    lastActivityAt: "Yesterday",
    tags: ["database", "infrastructure", "performance"],
  },
  {
    id: "3",
    title: "Best approach for real-time issue updates?",
    body: "We're evaluating WebSockets vs Server-Sent Events for live kanban board updates. What are your thoughts? SSE seems simpler for our current use case but WebSockets would give us bi-directional comms for the future.",
    category: "question",
    state: "answered",
    author: { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
    replyCount: 9,
    reactionCount: 4,
    isPinned: false,
    isLocked: false,
    createdAt: "Mar 20, 2026",
    lastActivityAt: "Mar 22, 2026",
    tags: ["architecture", "realtime"],
  },
  {
    id: "4",
    title: "Showing off TF-001: JWT refresh rotation is now live! 🔐",
    body: "After 2 sprints of work, the JWT refresh token rotation feature is finally merged and deployed. Here's a quick walkthrough of how it works and why it matters for security...",
    category: "show",
    state: "open",
    author: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
    replyCount: 5,
    reactionCount: 18,
    isPinned: false,
    isLocked: false,
    createdAt: "Mar 18, 2026",
    lastActivityAt: "Mar 19, 2026",
    tags: ["security", "auth", "backend"],
  },
  {
    id: "5",
    title: "Monthly retro — March 2026",
    body: "High points: shipped 3 major features, reduced bug count by 40%. Low points: sprint planning still feels rushed, we need more time for estimation. Let's discuss improvements for April.",
    category: "general",
    state: "closed",
    author: { name: "You", initials: "ME", color: "bg-primary" },
    replyCount: 11,
    reactionCount: 3,
    isPinned: false,
    isLocked: true,
    createdAt: "Mar 31, 2026",
    lastActivityAt: "Mar 31, 2026",
    tags: ["retrospective", "team"],
  },
]

// ---------------------------------------------------------------------------
// NewDiscussionDialog
// ---------------------------------------------------------------------------

function NewDiscussionDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [category, setCategory] = useState<DiscussionCategory>("general")

  function handleCreate() {
    if (!title.trim()) return
    setTitle("")
    setBody("")
    setCategory("general")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-9">
          <Plus className="size-4" />
          New discussion
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a discussion</DialogTitle>
          <DialogDescription>
            Share ideas, ask questions, or post announcements with your team.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Category</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(CATEGORY_CONFIG) as [DiscussionCategory, typeof CATEGORY_CONFIG[DiscussionCategory]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    category === key
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/30"
                  )}
                >
                  <span>{cfg.emoji}</span>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="discussion-title" className="text-sm font-medium text-foreground">Title</label>
            <Input
              id="discussion-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A clear, descriptive title…"
              className="h-9"
              autoFocus
            />
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="discussion-body" className="text-sm font-medium text-foreground">
              Body <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="discussion-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Provide context, details, or questions for your team…"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-30"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!title.trim()} className="gap-2">
            <MessageSquare className="size-4" />
            Start discussion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// DiscussionRow
// ---------------------------------------------------------------------------

function DiscussionRow({ discussion }: { readonly discussion: Discussion }) {
  const cat = CATEGORY_CONFIG[discussion.category]

  return (
    <div className="group flex gap-4 px-5 py-4 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
      {/* Category icon column */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        <div className="size-9 rounded-lg bg-muted/60 flex items-center justify-center text-lg">
          {cat.emoji}
        </div>
        {discussion.isPinned && (
          <Pin className="size-3 text-primary rotate-45 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5 min-w-0">
            {/* Title + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {discussion.title}
              </h3>
              {discussion.state === "answered" && (
                <Badge variant="outline" className="text-xs border-0 bg-emerald-500/15 text-emerald-400 px-1.5 py-0 h-4 flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="size-3" /> Answered
                </Badge>
              )}
              {discussion.state === "closed" && (
                <Badge variant="outline" className="text-xs border border-border text-muted-foreground px-1.5 py-0 h-4 shrink-0">
                  Closed
                </Badge>
              )}
              {discussion.isLocked && (
                <Lock className="size-3 text-muted-foreground shrink-0" />
              )}
            </div>

            {/* Body excerpt */}
            <p className="text-xs text-muted-foreground line-clamp-1 hidden sm:block">
              {discussion.body}
            </p>

            {/* Tags + meta */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("text-xs border px-1.5 py-0 h-4", cat.badgeClass)}>
                {cat.label}
              </Badge>
              {discussion.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2">
                <Pin className="size-4" /> {discussion.isPinned ? "Unpin" : "Pin discussion"}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2">
                <Lock className="size-4" /> {discussion.isLocked ? "Unlock" : "Lock discussion"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Footer meta */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <Avatar className="size-4">
            <AvatarFallback className={cn("text-[8px] text-white", discussion.author.color)}>
              {discussion.author.initials}
            </AvatarFallback>
          </Avatar>
          <span>{discussion.author.name}</span>
          <span>·</span>
          <span>{discussion.createdAt}</span>
          <span className="hidden xs:inline">·</span>
          <span className="hidden xs:flex items-center gap-1">
            <MessageSquare className="size-3" />
            {discussion.replyCount}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsUp className="size-3" />
            {discussion.reactionCount}
          </span>
          <span className="ml-auto text-muted-foreground/70">
            Active {discussion.lastActivityAt}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DiscussionsPage() {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all")

  const filtered = useMemo(() => {
    let list = DISCUSSIONS
    if (categoryFilter !== "all") list = list.filter((d) => d.category === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((d) => d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q))
    }
    // Pinned first
    return [...list.filter((d) => d.isPinned), ...list.filter((d) => !d.isPinned)]
  }, [search, categoryFilter])

  const openCount = DISCUSSIONS.filter((d) => d.state === "open").length

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discussions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount} open · {DISCUSSIONS.length} total · Team conversations and announcements
          </p>
        </div>
        <NewDiscussionDialog />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Category tabs */}
        <div className="flex items-center gap-0 border-b border-border overflow-x-auto scrollbar-hide">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategoryFilter(tab.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap",
                categoryFilter === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search discussions…"
          className="pl-8 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-border bg-card shadow-sm">
          <MessageSquare className="size-10 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium text-foreground">No discussions found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? "Try different keywords" : "Be the first to start a conversation"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {filtered.map((discussion) => (
            <DiscussionRow key={discussion.id} discussion={discussion} />
          ))}
        </div>
      )}
    </div>
  )
}
