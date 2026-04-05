"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  Plus,
  CircleDot,
  RefreshCw,
  Clock,
  CheckCircle2,
  Flag,
  User,
  Tag,
  CalendarIcon,
  ChevronDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"
type IssueStatus = "todo" | "in_progress" | "in_review" | "done"

interface IssueLabel {
  name: string
  color: string
}

interface CreateIssuePayload {
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  labels: IssueLabel[]
  dueDate: Date | null
}

interface CreateIssueDialogProps {
  readonly children?: React.ReactNode
  readonly defaultStatus?: IssueStatus
  readonly onCreated?: (payload: CreateIssuePayload) => void
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
]

const COMMON_LABELS: IssueLabel[] = [
  { name: "bug",      color: "#ef4444" },
  { name: "feature",  color: "#8b5cf6" },
  { name: "ui",       color: "#3b82f6" },
  { name: "backend",  color: "#f97316" },
  { name: "frontend", color: "#06b6d4" },
  { name: "auth",     color: "#eab308" },
  { name: "perf",     color: "#22c55e" },
  { name: "docs",     color: "#64748b" },
  { name: "seo",      color: "#ec4899" },
  { name: "security", color: "#dc2626" },
]

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; dotClass: string }[] = [
  { value: "urgent", label: "Urgent", dotClass: "bg-red-400" },
  { value: "high", label: "High", dotClass: "bg-orange-400" },
  { value: "medium", label: "Medium", dotClass: "bg-yellow-400" },
  { value: "low", label: "Low", dotClass: "bg-slate-400" },
  { value: "none", label: "No priority", dotClass: "bg-muted-foreground/30" },
]

const STATUS_OPTIONS: { value: IssueStatus; label: string; icon: React.ReactNode }[] = [
  { value: "todo", label: "Todo", icon: <CircleDot className="size-3.5 text-muted-foreground" /> },
  { value: "in_progress", label: "In Progress", icon: <RefreshCw className="size-3.5 text-blue-400" /> },
  { value: "in_review", label: "In Review", icon: <Clock className="size-3.5 text-yellow-400" /> },
  { value: "done", label: "Done", icon: <CheckCircle2 className="size-3.5 text-emerald-400" /> },
]

const MEMBERS = [
  { id: "me", name: "You", initials: "ME", color: "bg-primary" },
  { id: "sm", name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
  { id: "ep", name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
  { id: "tb", name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
  { id: "ld", name: "Lucas Dufour", initials: "LD", color: "bg-blue-500" },
]

// ---------------------------------------------------------------------------
// CreateIssueDialog
// ---------------------------------------------------------------------------

export function CreateIssueDialog({ children, defaultStatus = "todo", onCreated }: CreateIssueDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<IssueStatus>(defaultStatus)
  const [priority, setPriority] = useState<IssuePriority>("medium")
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [labels, setLabels] = useState<IssueLabel[]>([])
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [labelInput, setLabelInput] = useState("")
  const [customLabelColor, setCustomLabelColor] = useState(LABEL_COLORS[4])
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0]
  const currentPriority = PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[2]
  const currentAssignee = assigneeId ? MEMBERS.find((m) => m.id === assigneeId) : null

  function toggleLabel(label: IssueLabel) {
    setLabels((prev) =>
      prev.some((l) => l.name === label.name)
        ? prev.filter((l) => l.name !== label.name)
        : [...prev, label]
    )
  }

  function removeLabel(name: string) {
    setLabels((prev) => prev.filter((l) => l.name !== name))
  }

  function addCustomLabel() {
    const name = labelInput.trim().toLowerCase()
    if (name && !labels.some((l) => l.name === name)) {
      setLabels((prev) => [...prev, { name, color: customLabelColor }])
    }
    setLabelInput("")
  }

  function handleCreate() {
    if (!title.trim()) return
    onCreated?.({ title, description, status, priority, assigneeId, labels, dueDate: dueDate ?? null })
    resetForm()
    setOpen(false)
  }

  function resetForm() {
    setTitle("")
    setDescription("")
    setStatus(defaultStatus)
    setPriority("medium")
    setAssigneeId(null)
    setLabels([])
    setDueDate(undefined)
    setLabelInput("")
    setCustomLabelColor(LABEL_COLORS[4])
    setDatePopoverOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />
            New issue
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create issue</DialogTitle>
          <DialogDescription className="sr-only">Fill in the details to create a new issue.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title…"
              className="h-10 text-base font-medium border-0 bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50 border-b border-border/50 rounded-none"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && title.trim() && handleCreate()}
            />
          </div>

          {/* Description */}
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description, acceptance criteria, or context…"
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-25"
            />
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-2">
            {/* Status */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  {currentStatus.icon}
                  {currentStatus.label}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {STATUS_OPTIONS.map((s) => (
                  <DropdownMenuItem key={s.value} className="gap-2" onClick={() => setStatus(s.value)}>
                    {s.icon} {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Priority */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                  <Flag className="size-3.5 text-muted-foreground" />
                  <div className={cn("size-2 rounded-full", currentPriority.dotClass)} />
                  {currentPriority.label}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <DropdownMenuItem key={p.value} className="gap-2" onClick={() => setPriority(p.value)}>
                    <div className={cn("size-2 rounded-full", p.dotClass)} />
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Assignee */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  {currentAssignee ? (
                    <div className={cn("size-4 rounded-full flex items-center justify-center text-[8px] text-white font-semibold", currentAssignee.color)}>
                      {currentAssignee.initials}
                    </div>
                  ) : (
                    <User className="size-3.5 text-muted-foreground" />
                  )}
                  {currentAssignee ? currentAssignee.name : "Assignee"}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setAssigneeId(null)}>
                  <User className="size-4 mr-2 text-muted-foreground" /> Unassigned
                </DropdownMenuItem>
                {MEMBERS.map((m) => (
                  <DropdownMenuItem key={m.id} className="gap-2" onClick={() => setAssigneeId(m.id)}>
                    <div className={cn("size-5 rounded-full flex items-center justify-center text-[9px] text-white font-medium", m.color)}>
                      {m.initials}
                    </div>
                    {m.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Due date */}
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="pl-8 h-8 text-xs w-36 border-border"
              />
            </div>
          </div>

          {/* Labels */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Tag className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Labels</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_LABELS.map((label) => (
                <button
                  key={label}
                  onClick={() => toggleLabel(label)}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-xs border transition-all",
                    labels.includes(label)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {labels.filter((l) => !COMMON_LABELS.includes(l)).map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs gap-1">
                    {label}
                    <button onClick={() => toggleLabel(label)} className="hover:text-foreground">×</button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="Custom label…"
                className="h-7 text-xs w-36"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomLabel() } }}
              />
              {labelInput && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCustomLabel}>
                  Add
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!title.trim()} className="gap-2">
            <Plus className="size-4" />
            Create issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
