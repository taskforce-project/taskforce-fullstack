"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { useParams } from "next/navigation"
import {
  Circle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Plus,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react"

import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
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
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"
import type { Issue, IssueStatus, IssueStatusCategory, IssuePriority } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-red-400",
  HIGH:   "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW:    "bg-slate-400",
  NONE:   "bg-muted-foreground/30",
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]

const CATEGORY_OPTIONS: { value: IssueStatusCategory; label: string; color: string }[] = [
  { value: "BACKLOG",   label: "Backlog",    color: "#94a3b8" },
  { value: "UNSTARTED", label: "Non démarré", color: "#6366f1" },
  { value: "STARTED",   label: "En cours",   color: "#f59e0b" },
  { value: "COMPLETED", label: "Terminé",    color: "#10b981" },
  { value: "CANCELLED", label: "Annulé",     color: "#ef4444" },
]

function getMemberColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length]
}

function getMemberInitials(displayName: string | null, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return ((parts[0][0] ?? "") + (parts.at(-1)![0] ?? "")).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getCategoryIcon(category: IssueStatusCategory, color: string, size = "size-3.5") {
  const cls = `${size} shrink-0`
  switch (category) {
    case "BACKLOG":   return <Circle       className={cls} style={{ color }} />
    case "UNSTARTED": return <Circle       className={cls} style={{ color }} />
    case "STARTED":   return <RefreshCw   className={cls} style={{ color }} />
    case "COMPLETED": return <CheckCircle2 className={cls} style={{ color }} />
    case "CANCELLED": return <XCircle     className={cls} style={{ color }} />
  }
}

function extractParam(p: string | string[] | undefined): string {
  if (typeof p === "string") return p
  if (Array.isArray(p)) return p[0] ?? ""
  return ""
}

// ---------------------------------------------------------------------------
// Inline quick-add row
// ---------------------------------------------------------------------------

function QuickAddRow({
  statusId,
  workspaceSlug,
  projectId,
}: {
  readonly statusId: number
  readonly workspaceSlug: string
  readonly projectId: number
}) {
  const [active, setActive] = useState(false)
  const [title, setTitle] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const { createIssue } = useIssueStore()

  function activate() {
    setActive(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function submit() {
    const trimmed = title.trim()
    if (!trimmed) { setActive(false); setTitle(""); return }
    await createIssue(workspaceSlug, projectId, { title: trimmed, statusId })
    setTitle("")
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); submit() }
    if (e.key === "Escape") { setActive(false); setTitle("") }
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={activate}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-colors mt-1"
      >
        <Plus className="size-3.5 shrink-0" />
        Ajouter une issue
      </button>
    )
  }

  return (
    <div className="mt-1 rounded-lg border border-primary/40 bg-background p-2 shadow-sm">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (!title.trim()) { setActive(false) } }}
        placeholder="Titre de l'issue…"
        className="h-7 text-sm border-0 bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">Entrée pour créer · Échap pour annuler</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => { setActive(false); setTitle("") }}>
            Annuler
          </Button>
          <Button size="sm" className="h-5 text-[10px] px-2" onClick={submit} disabled={!title.trim()}>
            Créer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// IssueCard
// ---------------------------------------------------------------------------

function IssueCard({
  issue,
  statuses,
  onStatusChange,
}: {
  readonly issue: Issue
  readonly statuses: IssueStatus[]
  readonly onStatusChange: (issueId: number, statusId: number) => void
}) {
  return (
    <div className="group/card rounded-lg border border-border bg-card p-3 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium border"
              style={{ color: label.color, borderColor: `${label.color}40`, backgroundColor: `${label.color}15` }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-foreground leading-snug mb-3 line-clamp-2">
        {issue.title}
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Priority + identifier */}
          <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} title={issue.priority} />
          <span className="text-[10px] text-muted-foreground font-mono">{issue.identifier}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {issue.assignee && (
            <Avatar className="size-5">
              {issue.assignee.avatarUrl && <AvatarImage src={issue.assignee.avatarUrl} />}
              <AvatarFallback className={cn("text-[9px] text-white", getMemberColor(Number(issue.assignee.id)))}>
                {getMemberInitials(issue.assignee.displayName, issue.assignee.email)}
              </AvatarFallback>
            </Avatar>
          )}

          {/* Status change dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-0.5 text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/60"
                title="Changer le statut"
              >
                {getCategoryIcon(issue.status.category, issue.status.color, "size-3")}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {[...statuses].sort((a, b) => a.position - b.position).map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  className="gap-2 text-xs"
                  onClick={() => onStatusChange(issue.id, s.id)}
                >
                  {getCategoryIcon(s.category, s.color)}
                  {s.name}
                  {s.id === issue.status.id && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BoardColumn
// ---------------------------------------------------------------------------

function BoardColumn({
  status,
  issues,
  statuses,
  workspaceSlug,
  projectId,
  onStatusChange,
  onDeleteStatus,
  onRenameStatus,
  t,
}: {
  readonly status: IssueStatus
  readonly issues: Issue[]
  readonly statuses: IssueStatus[]
  readonly workspaceSlug: string
  readonly projectId: number
  readonly onStatusChange: (issueId: number, statusId: number) => void
  readonly onDeleteStatus: (statusId: number) => void
  readonly onRenameStatus: (statusId: number, name: string) => void
  readonly t: (k: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(status.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditName(status.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function commitEdit() {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== status.name) {
      onRenameStatus(status.id, trimmed)
    }
    setEditing(false)
  }

  function onEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit() }
    if (e.key === "Escape") { setEditing(false); setEditName(status.name) }
  }

  return (
    <div className="flex flex-col w-70 shrink-0">
      {/* Column header */}
      <div className="group/col flex items-center justify-between mb-2 px-1 py-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getCategoryIcon(status.category, status.color)}
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={onEditKeyDown}
              onBlur={commitEdit}
              className="text-xs font-semibold uppercase tracking-wide bg-transparent border-b border-primary outline-none w-full text-muted-foreground"
            />
          ) : (
            <span
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate cursor-pointer hover:text-foreground"
              onDoubleClick={startEdit}
              title="Double-cliquer pour renommer"
            >
              {status.name}
            </span>
          )}
          <span className="text-xs text-muted-foreground/60 font-medium ml-0.5 shrink-0">{issues.length}</span>
        </div>

        <div className="flex items-center gap-1">
          <CreateIssueDialog projectId={projectId} workspaceSlug={workspaceSlug} defaultStatusId={status.id}>
            <button
              type="button"
              className="size-6 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              title="Ajouter une issue"
            >
              <Plus className="size-3.5" />
            </button>
          </CreateIssueDialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="size-6 flex items-center justify-center rounded opacity-0 group-hover/col:opacity-100 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2 text-xs" onClick={startEdit}>
                Renommer
              </DropdownMenuItem>
              {!status.isDefault && (
                <DropdownMenuItem
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                  onClick={() => onDeleteStatus(status.id)}
                >
                  Supprimer
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Divider with status color */}
      <div className="h-0.5 w-full rounded-full mb-3 opacity-60" style={{ backgroundColor: status.color }} />

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 min-h-20">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            statuses={statuses}
            onStatusChange={onStatusChange}
          />
        ))}

        {issues.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 p-5">
            <p className="text-xs text-muted-foreground/60">{t("projects.detail.noIssues")}</p>
          </div>
        )}

        <QuickAddRow statusId={status.id} workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add Column popover
// ---------------------------------------------------------------------------

function AddColumnPopover({
  workspaceSlug,
  projectId,
}: {
  readonly workspaceSlug: string
  readonly projectId: number
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<IssueStatusCategory>("UNSTARTED")
  const [loading, setLoading] = useState(false)
  const { createStatus } = useIssueStore()

  const selectedCat = CATEGORY_OPTIONS.find((c) => c.value === category)!

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    await createStatus(workspaceSlug, projectId, {
      name: trimmed,
      category,
      color: selectedCat.color,
    })
    setLoading(false)
    setName("")
    setCategory("UNSTARTED")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex flex-col items-center justify-center w-70 shrink-0 h-24 rounded-xl border-2 border-dashed border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all gap-2"
        >
          <Plus className="size-5" />
          <span className="text-xs font-medium">Nouvelle colonne</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <p className="text-sm font-semibold mb-3">Créer une colonne</p>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Nom de la colonne"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-8 text-sm"
            autoFocus
          />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Catégorie</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-all",
                    category === opt.value
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-border/80"
                  )}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? "Création…" : "Créer"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Board page
// ---------------------------------------------------------------------------

export default function ProjectBoardPage() {
  const { t } = useTranslation()
  const params = useParams()
  const workspace = extractParam(params.workspace)
  const projectId = Number(extractParam(params.id))

  const { issues, statuses, isLoading, fetchIssues, fetchStatuses, updateIssue, deleteStatus, updateStatus } = useIssueStore()
  const { projects } = useProjectStore()

  const project = projects.find((p) => p.id === projectId)

  useEffect(() => {
    if (!workspace || !projectId) return
    fetchStatuses(workspace, projectId)
    fetchIssues(workspace, projectId)
  }, [workspace, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses]
  )

  const issuesByStatus = useMemo(() => {
    const map = new Map<number, Issue[]>()
    for (const s of statuses) map.set(s.id, [])
    for (const issue of issues) {
      const col = map.get(issue.status.id)
      if (col) col.push(issue)
    }
    return map
  }, [issues, statuses])

  async function handleStatusChange(issueId: number, statusId: number) {
    if (!workspace) return
    await updateIssue(workspace, projectId, issueId, { statusId })
  }

  async function handleDeleteStatus(statusId: number) {
    if (!workspace) return
    await deleteStatus(workspace, projectId, statusId)
  }

  async function handleRenameStatus(statusId: number, name: string) {
    if (!workspace) return
    await updateStatus(workspace, projectId, statusId, { name })
  }

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <MoreHorizontal className="size-3.5" />
            Filtres
          </Button>
        </div>
        {project && (
          <CreateIssueDialog projectId={projectId} workspaceSlug={workspace}>
            <Button size="sm" className="gap-1.5 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" />
              {t("projects.detail.newIssue")}
            </Button>
          </CreateIssueDialog>
        )}
      </div>

      {isLoading && statuses.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Chargement…
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-6 -mx-4 md:-mx-6 px-4 md:px-6 items-start">
          {sortedStatuses.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              issues={issuesByStatus.get(status.id) ?? []}
              statuses={sortedStatuses}
              workspaceSlug={workspace}
              projectId={projectId}
              onStatusChange={handleStatusChange}
              onDeleteStatus={handleDeleteStatus}
              onRenameStatus={handleRenameStatus}
              t={t}
            />
          ))}
          <AddColumnPopover workspaceSlug={workspace} projectId={projectId} />
        </div>
      )}
    </div>
  )
}