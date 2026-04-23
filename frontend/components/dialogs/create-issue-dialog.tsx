"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import {
  Plus,
  RefreshCw,
  Circle,
  CheckCircle2,
  XCircle,
  Flag,
  User,
  Tag,
  CalendarIcon,
  ChevronDown,
  X,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"
import { createProjectLabel } from "@/lib/api/project-service"
import type { Issue, IssuePriority, IssueStatusCategory } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateIssueDialogProps {
  readonly children?: React.ReactNode
  readonly projectId?: number
  readonly workspaceSlug?: string
  readonly defaultStatusId?: number
  readonly onCreated?: (issue: Issue) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; dotClass: string }[] = [
  { value: "URGENT", label: "Urgent",      dotClass: "bg-red-400" },
  { value: "HIGH",   label: "High",        dotClass: "bg-orange-400" },
  { value: "MEDIUM", label: "Medium",      dotClass: "bg-yellow-400" },
  { value: "LOW",    label: "Low",         dotClass: "bg-slate-400" },
  { value: "NONE",   label: "No priority", dotClass: "bg-muted-foreground/30" },
]

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
]

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]

function getMemberInitials(displayName: string | null, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return ((parts[0][0] ?? "") + (parts.at(-1)![0] ?? "")).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getMemberColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length]
}

function getCategoryIcon(category: IssueStatusCategory, color: string) {
  switch (category) {
    case "BACKLOG":   return <Circle       className="size-3.5" style={{ color }} />
    case "UNSTARTED": return <Circle       className="size-3.5" style={{ color }} />
    case "STARTED":   return <RefreshCw   className="size-3.5" style={{ color }} />
    case "COMPLETED": return <CheckCircle2 className="size-3.5" style={{ color }} />
    case "CANCELLED": return <XCircle     className="size-3.5" style={{ color }} />
  }
}

// ---------------------------------------------------------------------------
// CreateIssueDialog
// ---------------------------------------------------------------------------

export function CreateIssueDialog({
  children,
  projectId,
  workspaceSlug,
  defaultStatusId,
  onCreated,
}: CreateIssueDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [statusId, setStatusId] = useState<number | undefined>(defaultStatusId)
  const [priority, setPriority] = useState<IssuePriority>("MEDIUM")
  const [assigneeId, setAssigneeId] = useState<number | undefined>(undefined)
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([])
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [labelInput, setLabelInput] = useState("")
  const [customLabelColor, setCustomLabelColor] = useState(LABEL_COLORS[4])
  const [isCreating, setIsCreating] = useState(false)

  const { statuses, fetchStatuses, createIssue } = useIssueStore()
  const { projects } = useProjectStore()

  const project = projectId ? projects.find((p) => p.id === projectId) : null
  const members = project?.members ?? []
  const projectLabels = project?.labels ?? []

  useEffect(() => {
    if (open && workspaceSlug && projectId && statuses.length === 0) {
      fetchStatuses(workspaceSlug, projectId)
    }
  }, [open, workspaceSlug, projectId, statuses.length, fetchStatuses])

  useEffect(() => {
    if (statuses.length > 0 && statusId === undefined) {
      const defaultStatus = statuses.find((s) => s.isDefault) ?? [...statuses].sort((a, b) => a.position - b.position)[0]
      if (defaultStatus) setStatusId(defaultStatus.id)
    }
  }, [statuses, statusId])

  const currentStatus = statuses.find((s) => s.id === statusId)
  const currentPriority = PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[2]
  const currentAssignee = assigneeId !== undefined ? members.find((m) => m.userId === assigneeId) : null

  function toggleLabel(labelId: number) {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    )
  }

  async function addCustomLabel() {
    const name = labelInput.trim().toLowerCase()
    if (!name || !workspaceSlug || !projectId) return
    try {
      await createProjectLabel(workspaceSlug, projectId, { name, color: customLabelColor })
      const { fetchProjects } = useProjectStore.getState()
      await fetchProjects(workspaceSlug)
    } catch {
      // silently fail
    }
    setLabelInput("")
  }

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !workspaceSlug || !projectId) return
    setIsCreating(true)
    try {
      const issue = await createIssue(workspaceSlug, projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        statusId,
        priority,
        assigneeId,
        dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
      })
      if (issue) {
        onCreated?.(issue)
        resetForm()
        setOpen(false)
      }
    } finally {
      setIsCreating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, statusId, priority, assigneeId, dueDate, workspaceSlug, projectId])

  function resetForm() {
    setTitle("")
    setDescription("")
    setStatusId(defaultStatusId)
    setPriority("MEDIUM")
    setAssigneeId(undefined)
    setSelectedLabelIds([])
    setDueDate(undefined)
    setLabelInput("")
    setCustomLabelColor(LABEL_COLORS[4])
    setDatePopoverOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }} modal={false}>
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
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title…"
            className="h-10 text-base font-medium"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && title.trim() && handleCreate()}
          />

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description, acceptance criteria, or context…"
            className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[100px]"
          />

          {/* Metadata row */}
          <div className="flex flex-wrap gap-2">
            {/* Status */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  {currentStatus
                    ? getCategoryIcon(currentStatus.category, currentStatus.color)
                    : <Circle className="size-3.5 text-muted-foreground" />
                  }
                  {currentStatus?.name ?? "Status"}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {[...statuses]
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <DropdownMenuItem key={s.id} className="gap-2" onClick={() => setStatusId(s.id)}>
                      {getCategoryIcon(s.category, s.color)}
                      {s.name}
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
            {members.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    {currentAssignee ? (
                      <Avatar className="size-4">
                        {currentAssignee.avatarUrl && <AvatarImage src={currentAssignee.avatarUrl} />}
                        <AvatarFallback className={cn("text-[8px] text-white", getMemberColor(currentAssignee.userId))}>
                          {getMemberInitials(currentAssignee.displayName, currentAssignee.email)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <User className="size-3.5 text-muted-foreground" />
                    )}
                    {currentAssignee
                      ? (currentAssignee.displayName ?? currentAssignee.email)
                      : "Assignee"}
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setAssigneeId(undefined)}>
                    <User className="size-4 mr-2 text-muted-foreground" /> Unassigned
                  </DropdownMenuItem>
                  {members.map((m) => (
                    <DropdownMenuItem key={m.userId} className="gap-2" onClick={() => setAssigneeId(m.userId)}>
                      <Avatar className="size-5">
                        {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                        <AvatarFallback className={cn("text-[9px] text-white", getMemberColor(m.userId))}>
                          {getMemberInitials(m.displayName, m.email)}
                        </AvatarFallback>
                      </Avatar>
                      {m.displayName ?? m.email}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Due date */}
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="size-3.5 text-muted-foreground" />
                  {dueDate ? format(dueDate, "MMM d, yyyy") : "Due date"}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(date) => { setDueDate(date); setDatePopoverOpen(false) }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Labels */}
          {projectLabels.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Tag className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Labels</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {projectLabels.map((label) => {
                  const isSelected = selectedLabelIds.includes(label.id)
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs border transition-all",
                        isSelected
                          ? "border-transparent text-white"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
                      )}
                      style={isSelected ? { backgroundColor: label.color, borderColor: label.color } : undefined}
                    >
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                      {label.name}
                    </button>
                  )
                })}
              </div>

              {selectedLabelIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedLabelIds.map((id) => {
                    const label = projectLabels.find((l) => l.id === id)
                    if (!label) return null
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs gap-1 border-0"
                        style={{ backgroundColor: label.color + "33", color: label.color }}
                      >
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                        {label.name}
                        <button type="button" onClick={() => toggleLabel(id)} className="hover:opacity-70 ml-0.5">
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Create new label */}
          {workspaceSlug && projectId && (
            <div className="flex items-center gap-2">
              <Tag className="size-3.5 text-muted-foreground shrink-0" />
              <div className="flex gap-1">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCustomLabelColor(color)}
                    className={cn(
                      "size-5 rounded-full border-2 transition-all",
                      customLabelColor === color ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <Input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="New label…"
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomLabel() } }}
              />
              {labelInput && (
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={addCustomLabel}>
                  Add
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!title.trim() || isCreating || !workspaceSlug || !projectId}
            className="gap-2"
          >
            <Plus className="size-4" />
            {isCreating ? "Creating…" : "Create issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
