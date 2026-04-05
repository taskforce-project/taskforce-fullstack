"use client"

import { useState, useRef, useEffect } from "react"
import {
  X, RefreshCw, Clock, CheckCircle2, AlertTriangle, CircleDot,
  Flag, Tag, Calendar, Layers, GitBranch, MessageSquare, Activity,
  ChevronDown, Send, ExternalLink, Pencil, Check as CheckIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  Sheet, SheetContent, SheetClose, SheetTitle,
} from "@/components/ui/sheet"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
export type IssueStatus   = "todo" | "in_progress" | "in_review" | "done" | "cancelled"

export interface SheetIssue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  status: IssueStatus
  assignee: { initials: string; color: string; name: string } | null
  labels: string[]
  dueDate: string | null
  storyPoints: number | null
  cycle: string | null
  createdAt: string
  description?: string
}

// ---------------------------------------------------------------------------
// Local config
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<IssuePriority, { dot: string; label: string }> = {
  urgent:  { dot: "bg-red-400",               label: "Urgent" },
  high:    { dot: "bg-orange-400",             label: "High" },
  medium:  { dot: "bg-yellow-400",             label: "Medium" },
  low:     { dot: "bg-slate-400",              label: "Low" },
  none:    { dot: "bg-muted-foreground/30",    label: "None" },
}

const STATUS_CONFIG: Record<IssueStatus, { icon: React.ReactNode; label: string; color: string }> = {
  todo:        { icon: <CircleDot className="size-3.5" />,     label: "Todo",        color: "text-muted-foreground" },
  in_progress: { icon: <RefreshCw className="size-3.5" />,     label: "In Progress", color: "text-blue-400" },
  in_review:   { icon: <Clock className="size-3.5" />,         label: "In Review",   color: "text-yellow-400" },
  done:        { icon: <CheckCircle2 className="size-3.5" />,  label: "Done",        color: "text-emerald-400" },
  cancelled:   { icon: <X className="size-3.5" />,             label: "Cancelled",   color: "text-muted-foreground" },
}

const MOCK_COMMENTS = [
  { id: "1", author: "Sophie M.", initials: "SM", color: "bg-violet-500", time: "2 days ago", body: "I've started looking into this. We need to make sure the token store is cleared on logout too." },
  { id: "2", author: "You",       initials: "ME", color: "bg-primary",    time: "1 day ago",  body: "Good point, I'll add that to the acceptance criteria." },
]

const MOCK_ACTIVITY = [
  { id: "a1", text: "Status changed to In Progress",      time: "3 days ago" },
  { id: "a2", text: "Assigned to Sophie Martin",          time: "3 days ago" },
  { id: "a3", text: "Added to Sprint 4",                  time: "2 days ago" },
  { id: "a4", text: "Priority changed from Medium to High", time: "1 day ago" },
]

const TEAM_MEMBERS = [
  { initials: "ME", color: "bg-primary",    name: "You" },
  { initials: "SM", color: "bg-violet-500", name: "Sophie Martin" },
  { initials: "EP", color: "bg-emerald-500",name: "Emma Petit" },
  { initials: "TB", color: "bg-orange-500", name: "Thomas Bernard" },
]

const ALL_LABELS = ["bug", "feature", "ui", "backend", "auth", "perf", "docs", "test", "design"]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaRow({ icon, label, children }: Readonly<{ icon: React.ReactNode; label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 w-32 shrink-0 text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface IssueSheetProps {
  issue: SheetIssue | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IssueSheet({ issue, open, onOpenChange }: Readonly<IssueSheetProps>) {
  const [comment, setComment] = useState("")
  const [tab, setTab] = useState<"comments" | "activity">("comments")
  const [status, setStatus] = useState<IssueStatus>(issue?.status ?? "todo")

  // Main content editing
  const [title, setTitle] = useState(issue?.title ?? "")
  const [editingTitle, setEditingTitle] = useState(false)
  const [description, setDescription] = useState(issue?.description ?? "")
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(issue?.description ?? "")
  const titleRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Sidebar editable state
  const [priority, setPriority] = useState<IssuePriority>(issue?.priority ?? "none")
  const [assignee, setAssignee] = useState(issue?.assignee ?? null)
  const [labels, setLabels] = useState<string[]>(issue?.labels ?? [])
  const [points, setPoints] = useState<number | null>(issue?.storyPoints ?? null)
  const [editingPoints, setEditingPoints] = useState(false)
  const [pointsDraft, setPointsDraft] = useState(String(issue?.storyPoints ?? ""))
  const [cycle, setCycle] = useState<string | null>(issue?.cycle ?? null)
  const [editingCycle, setEditingCycle] = useState(false)
  const [cycleDraft, setCycleDraft] = useState(issue?.cycle ?? "")
  const [dueDate, setDueDate] = useState<string | null>(issue?.dueDate ?? null)
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [dueDateDraft, setDueDateDraft] = useState("")
  const pointsRef = useRef<HTMLInputElement>(null)
  const cycleRef  = useRef<HTMLInputElement>(null)
  const dueDateRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editingTitle)   titleRef.current?.focus() }, [editingTitle])
  useEffect(() => { if (editingDesc)    descRef.current?.focus()  }, [editingDesc])
  useEffect(() => { if (editingPoints)  pointsRef.current?.focus() }, [editingPoints])
  useEffect(() => { if (editingCycle)   cycleRef.current?.focus()  }, [editingCycle])
  useEffect(() => { if (editingDueDate) dueDateRef.current?.focus() }, [editingDueDate])

  if (!issue) return null

  const statusCfg   = STATUS_CONFIG[status]
  const priorityCfg = PRIORITY_CONFIG[priority]
  const isOverdue   = dueDate === "Overdue"
  const noAssignee  = assignee === null

  function savePoints() {
    const val = pointsDraft.trim()
    setPoints(val === "" ? null : Number(val))
    setEditingPoints(false)
    toast.success("Points updated")
  }

  function saveCycle() {
    setCycle(cycleDraft.trim() || null)
    setEditingCycle(false)
    toast.success("Cycle updated")
  }

  function saveDueDate() {
    setDueDate(dueDateDraft || null)
    setEditingDueDate(false)
    if (dueDateDraft) toast.success("Due date updated")
  }

  function onPointsKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { savePoints() } else if (e.key === "Escape") { setEditingPoints(false) }
  }

  function onCycleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { saveCycle() } else if (e.key === "Escape") { setEditingCycle(false) }
  }

  function onDueDateKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setEditingDueDate(false) }
  }

  function toggleLabel(l: string) {
    setLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  function onPointsClick() { setPointsDraft(String(points ?? "")); setEditingPoints(true) }
  function onCycleClick()  { setCycleDraft(cycle ?? ""); setEditingCycle(true) }
  function onDueDateClick() { setDueDateDraft(dueDate && dueDate !== "Overdue" ? dueDate : ""); setEditingDueDate(true) }

  function handleSendComment() {
    if (!comment.trim()) return
    toast.success("Comment added")
    setComment("")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-3xl flex flex-col p-0 gap-0"
      >
        <VisuallyHidden>
          <SheetTitle>{issue.title}</SheetTitle>
        </VisuallyHidden>

        {/* ── Topbar (GitHub-style: breadcrumb + actions) ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-muted/30">
          <span className="text-xs font-mono text-muted-foreground">{issue.identifier}</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-muted/60 transition-colors", statusCfg.color)}>
                {statusCfg.icon}
                <span className="ml-1">{statusCfg.label}</span>
                <ChevronDown className="size-3 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-36">
              {(Object.keys(STATUS_CONFIG) as IssueStatus[]).map((s) => (
                <DropdownMenuItem
                  key={s}
                  className={cn("flex items-center gap-2 text-xs", STATUS_CONFIG[s].color)}
                  onClick={() => { setStatus(s); toast.success(`Status → ${STATUS_CONFIG[s].label}`) }}
                >
                  {STATUS_CONFIG[s].icon}
                  {STATUS_CONFIG[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => toast.info("Opening full page…")}
          >
            <ExternalLink className="size-3.5" />
            Open
          </Button>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </Button>
          </SheetClose>
        </div>

        {/* ── Main body: scrollable, two columns ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: title + description + comments (scrollable) */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            {/* Title — inline editable */}
            {editingTitle ? (
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => { setEditingTitle(false); toast.success("Title updated") }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setEditingTitle(false); toast.success("Title updated") }
                  if (e.key === "Escape") { setTitle(issue.title); setEditingTitle(false) }
                }}
                className="w-full text-xl font-semibold text-foreground leading-snug bg-transparent border-b-2 border-primary outline-none pb-0.5"
              />
            ) : (
              <button
                type="button"
                className="w-full text-xl font-semibold text-foreground leading-snug rounded px-0.5 -mx-0.5 hover:bg-muted/50 transition-colors group flex items-start gap-2 text-left"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                <span className="flex-1">{title || issue.title}</span>
                <Pencil className="size-3.5 mt-1 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
              </button>
            )}

            {/* Description — inline editable */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
              {editingDesc ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    ref={descRef}
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setDescDraft(description); setEditingDesc(false) } }}
                    rows={5}
                    className="w-full rounded-md border border-primary/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/20 resize-none transition-all"
                    placeholder="Add a description…"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => { setDescription(descDraft); setEditingDesc(false); toast.success("Description updated") }}>
                      <CheckIcon className="size-3" />Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDescDraft(description); setEditingDesc(false) }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDescDraft(description); setEditingDesc(true) }}
                  className="w-full rounded-md px-3 py-2.5 -mx-3 text-sm text-muted-foreground leading-relaxed hover:bg-muted/40 transition-colors group relative text-left"
                  title="Click to edit"
                >
                  {description
                    ? <span className="whitespace-pre-wrap">{description}</span>
                    : <span className="italic opacity-60">No description provided. Click to add one.</span>}
                  <Pencil className="size-3 absolute top-2.5 right-2 opacity-0 group-hover:opacity-40 transition-opacity" />
                </button>
              )}
            </div>

            <Separator />

            {/* Comments / Activity tabs */}
            <div>
              <div className="flex gap-4 mb-4 border-b border-border">
                <button
                  type="button"
                  onClick={() => setTab("comments")}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                    tab === "comments"
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageSquare className="size-3.5" />
                  Comments ({MOCK_COMMENTS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("activity")}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                    tab === "activity"
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Activity className="size-3.5" />
                  Activity
                </button>
              </div>

              {tab === "comments" && (
                <div className="flex flex-col gap-5">
                  {MOCK_COMMENTS.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <Avatar className="size-7 shrink-0 mt-0.5">
                        <AvatarFallback className={cn("text-[9px] text-white", c.color)}>
                          {c.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 rounded-lg border border-border bg-muted/20 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
                          <span className="text-xs font-semibold text-foreground">{c.author}</span>
                          <span className="text-xs text-muted-foreground">{c.time}</span>
                        </div>
                        <p className="px-3 py-2.5 text-sm text-foreground leading-relaxed">{c.body}</p>
                      </div>
                    </div>
                  ))}

                  {/* Comment input */}
                  <div className="flex gap-3 mt-1">
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="text-[9px] text-white bg-primary">ME</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 rounded-lg border border-border overflow-hidden focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                      <input
                        type="text"
                        placeholder="Leave a comment…"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSendComment() }}
                        className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted-foreground outline-none"
                      />
                      {comment.trim() && (
                        <div className="flex justify-end px-2 pb-2">
                          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSendComment}>
                            <Send className="size-3" />
                            Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === "activity" && (
                <div className="flex flex-col gap-0">
                  {MOCK_ACTIVITY.map((a, i) => (
                    <div key={a.id} className="flex items-start gap-3 py-2.5 relative">
                      {i < MOCK_ACTIVITY.length - 1 && (
                        <div className="absolute left-2 top-7 bottom-0 w-px bg-border" />
                      )}
                      <div className="size-4 mt-0.5 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center">
                        <div className="size-1.5 rounded-full bg-muted-foreground/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground">{a.text}</span>
                        <span className="text-xs text-muted-foreground/60 ml-2">{a.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: metadata sidebar (fully editable) */}
          <div className="w-56 shrink-0 border-l border-border overflow-y-auto px-4 py-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Details</p>

            {/* Priority */}
            <MetaRow icon={<Flag className="size-3.5" />} label="Priority">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1.5 hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors">
                    <div className={cn("size-2 rounded-full shrink-0", priorityCfg.dot)} />
                    <span className="text-xs flex-1">{priorityCfg.label}</span>
                    <ChevronDown className="size-3 opacity-40 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-36">
                  {(Object.keys(PRIORITY_CONFIG) as IssuePriority[]).map((p) => (
                    <DropdownMenuItem key={p} className="flex items-center gap-2 text-xs" onClick={() => { setPriority(p); toast.success(`Priority → ${PRIORITY_CONFIG[p].label}`) }}>
                      <div className={cn("size-2 rounded-full", PRIORITY_CONFIG[p].dot)} />
                      {PRIORITY_CONFIG[p].label}
                      {priority === p ? <CheckIcon className="ml-auto size-3 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </MetaRow>

            {/* Assignee */}
            <MetaRow icon={<Avatar className="size-3.5"><AvatarFallback className="text-[7px]">?</AvatarFallback></Avatar>} label="Assignee">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1.5 hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors">
                    {assignee ? (
                      <>
                        <Avatar className="size-4 shrink-0">
                          <AvatarFallback className={cn("text-[8px] text-white", assignee.color)}>{assignee.initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs flex-1 truncate">{assignee.name}</span>
                      </>
                    ) : (
                      <span className="text-xs flex-1 text-muted-foreground">Unassigned</span>
                    )}
                    <ChevronDown className="size-3 opacity-40 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem className="flex items-center gap-2 text-xs" onClick={() => { setAssignee(null); toast.success("Unassigned") }}>
                    <span className="size-4 inline-block shrink-0" />
                    <span className="text-muted-foreground">No assignee</span>
                    {noAssignee && <CheckIcon className="ml-auto size-3 text-primary" />}
                  </DropdownMenuItem>
                  {TEAM_MEMBERS.map((m) => (
                    <DropdownMenuItem key={m.name} className="flex items-center gap-2 text-xs" onClick={() => { setAssignee(m); toast.success(`Assigned to ${m.name}`) }}>
                      <Avatar className="size-4 shrink-0">
                        <AvatarFallback className={cn("text-[8px] text-white", m.color)}>{m.initials}</AvatarFallback>
                      </Avatar>
                      {m.name}
                      {assignee?.name === m.name ? <CheckIcon className="ml-auto size-3 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </MetaRow>

            {/* Labels — multi-select */}
            <MetaRow icon={<Tag className="size-3.5" />} label="Labels">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-start gap-1 hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors min-h-6">
                    <div className="flex flex-wrap gap-1 flex-1">
                      {labels.length > 0
                        ? labels.map((l) => (
                            <Badge key={l} variant="secondary" className="text-[10px] px-1.5 h-4 bg-muted/60 border-0 text-muted-foreground">{l}</Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">Add label</span>}
                    </div>
                    <ChevronDown className="size-3 opacity-40 shrink-0 mt-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-32">
                  {ALL_LABELS.map((l) => (
                    <DropdownMenuItem key={l} className="flex items-center gap-2 text-xs" onSelect={(e) => { e.preventDefault(); toggleLabel(l) }}>
                      {l}
                      {labels.includes(l) ? <CheckIcon className="ml-auto size-3 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </MetaRow>

            {/* Points — inline editable */}
            <MetaRow icon={<Layers className="size-3.5" />} label="Points">
              {editingPoints ? (
                <input ref={pointsRef} type="number" min={0} max={99} value={pointsDraft}
                  onChange={(e) => setPointsDraft(e.target.value)}
                  onBlur={savePoints}
                  onKeyDown={onPointsKey}
                  className="w-16 h-5 text-xs bg-transparent border-b border-primary outline-none"
                />
              ) : (
                <button type="button" onClick={onPointsClick}
                  className="flex items-center gap-1 text-xs hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors group">
                  <span className="flex-1 text-foreground">{points === null ? "—" : `${points} pts`}</span>
                  <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
                </button>
              )}
            </MetaRow>

            {/* Cycle — inline editable */}
            <MetaRow icon={<GitBranch className="size-3.5" />} label="Cycle">
              {editingCycle ? (
                <input ref={cycleRef} type="text" value={cycleDraft}
                  onChange={(e) => setCycleDraft(e.target.value)}
                  onBlur={saveCycle}
                  onKeyDown={onCycleKey}
                  placeholder="e.g. Sprint 4"
                  className="w-full h-5 text-xs bg-transparent border-b border-primary outline-none placeholder:text-muted-foreground/50"
                />
              ) : (
                <button type="button" onClick={onCycleClick}
                  className="flex items-center gap-1 text-xs hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors group">
                  <span className="flex-1 truncate text-foreground">{cycle ?? "—"}</span>
                  <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
                </button>
              )}
            </MetaRow>

            {/* Due date — date picker */}
            <MetaRow icon={<Calendar className="size-3.5" />} label="Due date">
              {editingDueDate ? (
                <input ref={dueDateRef} type="date" value={dueDateDraft}
                  onChange={(e) => setDueDateDraft(e.target.value)}
                  onBlur={saveDueDate}
                  onKeyDown={onDueDateKey}
                  className="text-xs bg-background border border-border rounded px-1 h-6 outline-none focus:border-primary/50 w-full scheme-dark"
                />
              ) : (
                <button type="button" onClick={onDueDateClick}
                  className="flex items-center gap-1 text-xs hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors group">
                  <span className={cn("flex-1", isOverdue ? "text-red-400 font-medium" : "text-foreground")}>
                    {isOverdue && <AlertTriangle className="size-3 inline mr-1" />}
                    {dueDate ?? "—"}
                  </span>
                  <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
                </button>
              )}
            </MetaRow>

            {/* Created — read-only */}
            <MetaRow icon={<Activity className="size-3.5" />} label="Created">
              <span className="text-xs text-muted-foreground">{issue.createdAt}</span>
            </MetaRow>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
