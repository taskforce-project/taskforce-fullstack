"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Circle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Plus,
  MoreHorizontal,
  ChevronDown,
  Download,
  Pin,
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

import { IssueSheet, type SheetIssue } from "@/components/sheets/issue-sheet"
import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ColorPicker } from "@/components/ui/color-picker"
import { InlineIssueFilters } from "@/components/issues/issue-filters"
import { BulkAssignDialog } from "@/components/dialogs/bulk-assign-dialog"
import { type IssueFilterState, EMPTY_ISSUE_FILTERS, applyIssueFilters } from "@/lib/issue-filters"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectRealtime } from "@/lib/hooks/use-project-realtime"
import { downloadProjectExport } from "@/lib/api/project-service"
import { notifyProgress } from "@/lib/notify"
import { toast } from "sonner"
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
  { value: "UNSTARTED", label: "Not started", color: "#6366f1" },
  { value: "STARTED",   label: "In progress",   color: "#f59e0b" },
  { value: "COMPLETED", label: "Done",    color: "#10b981" },
  { value: "CANCELLED", label: "Cancelled",     color: "#ef4444" },
]

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

function toSheetIssue(issue: Issue): SheetIssue {
  const priorityMap: Record<IssuePriority, SheetIssue["priority"]> = {
    NONE: "NONE", URGENT: "URGENT", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW",
  }
  return {
    id:             String(issue.id),
    identifier:     issue.identifier,
    title:          issue.title,
    description:    issue.description ?? undefined,
    priority:       priorityMap[issue.priority],
    statusId:       issue.status.id,
    statusName:     issue.status.name,
    statusCategory: issue.status.category,
    assignee:       issue.assignee
      ? { initials: issue.assignee.email.slice(0, 2).toUpperCase(), color: AVATAR_COLORS[issue.assignee.id % AVATAR_COLORS.length], name: issue.assignee.displayName ?? issue.assignee.email, userId: issue.assignee.id, email: issue.assignee.email }
      : null,
    assigneeId:     issue.assignee?.id ?? null,
    labels:         issue.labels,
    pinned:         issue.pinned,
    archived:       issue.archived,
    dueDate:        issue.dueDate,
    storyPoints:    issue.storyPoints,
    createdAt:      issue.createdAt,
  }
}

// ---------------------------------------------------------------------------
// IssueCard (draggable)
// ---------------------------------------------------------------------------

function IssueCard({
  issue,
  statuses,
  onStatusChange,
  onOpen,
}: {
  readonly issue: Issue
  readonly statuses: IssueStatus[]
  readonly onStatusChange: (issueId: number, statusId: number) => void
  readonly onOpen: (issue: Issue) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${issue.id}`,
    data: { issueId: issue.id, statusId: issue.status.id },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(issue)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(issue)}
      className={cn(
        "group/card rounded-lg border border-border bg-card p-3 transition-all cursor-grab active:cursor-grabbing",
        // Le clone est rendu via <DragOverlay> → on laisse juste un placeholder estompé en place
        isDragging ? "opacity-40" : "hover:border-primary/30 hover:shadow-md"
      )}
    >
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
        {issue.pinned && <Pin className="inline size-3 mr-1 -mt-0.5 text-amber-500 fill-amber-500" aria-label="Pinned" />}
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
            <UserAvatar
              email={issue.assignee.email}
              name={issue.assignee.displayName ?? issue.assignee.email}
              avatarUrl={issue.assignee.avatarUrl}
              className="size-5"
              fallbackClassName="text-[9px]"
            />
          )}

          {/* Status change dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-0.5 text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/60"
                title="Change status"
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
// IssueCardPreview - clone rendu dans le <DragOverlay> (suit le curseur, fluide)
// ---------------------------------------------------------------------------

function IssueCardPreview({ issue }: { readonly issue: Issue }) {
  return (
    <div className="w-64 rotate-2 cursor-grabbing rounded-lg border border-primary/40 bg-card p-3 shadow-xl">
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
      <p className="text-sm text-foreground leading-snug mb-3 line-clamp-2">{issue.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
          <span className="text-[10px] text-muted-foreground font-mono">{issue.identifier}</span>
        </div>
        {issue.assignee && (
          <UserAvatar
            email={issue.assignee.email}
            name={issue.assignee.displayName ?? issue.assignee.email}
            avatarUrl={issue.assignee.avatarUrl}
            className="size-5"
            fallbackClassName="text-[9px]"
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BoardColumn (droppable)
// ---------------------------------------------------------------------------

function BoardColumn({
  status,
  issues,
  statuses,
  onStatusChange,
  onDeleteStatus,
  onRenameStatus,
  onChangeColor,
  onOpenIssue,
  isOver,
  t,
}: {
  readonly status: IssueStatus
  readonly issues: Issue[]
  readonly statuses: IssueStatus[]
  readonly onStatusChange: (issueId: number, statusId: number) => void
  readonly onDeleteStatus: (statusId: number) => void
  readonly onRenameStatus: (statusId: number, name: string) => void
  readonly onChangeColor: (statusId: number, color: string) => void
  readonly onOpenIssue: (issue: Issue) => void
  readonly isOver: boolean
  readonly t: (k: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(status.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const { setNodeRef } = useDroppable({ id: `col-${status.id}`, data: { statusId: status.id } })

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
    <div className="flex h-full min-h-0 w-70 shrink-0 flex-col">
      {/* Column header */}
      <div className="group/col flex items-center justify-between mb-2 px-1 py-1.5 shrink-0">
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
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate cursor-pointer hover:text-foreground text-left bg-transparent border-0 p-0 min-w-0"
              onDoubleClick={startEdit}
              onKeyDown={(e) => e.key === "Enter" && startEdit()}
              title="Double-click to rename"
            >
              {status.name}
            </button>
          )}
          <span className="text-xs text-muted-foreground/60 font-medium ml-0.5 shrink-0">{issues.length}</span>
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="size-6 flex items-center justify-center rounded opacity-0 group-hover/col:opacity-100 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className="gap-2 text-xs" onClick={startEdit}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">Color</DropdownMenuLabel>
              <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <ColorPicker value={status.color} onChange={(c) => onChangeColor(status.id, c)} />
              </div>
              {!status.isDefault && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-xs text-destructive focus:text-destructive"
                    onClick={() => onDeleteStatus(status.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Divider with status color */}
      <div className="h-0.5 w-full rounded-full mb-3 opacity-60 shrink-0" style={{ backgroundColor: status.color }} />

      {/* Cards (droppable) - scroll interne par colonne */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto rounded-lg pr-0.5 transition-colors",
          isOver && "bg-primary/5 ring-1 ring-primary/30"
        )}
      >
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            statuses={statuses}
            onStatusChange={onStatusChange}
            onOpen={onOpenIssue}
          />
        ))}

        {issues.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 p-5">
            <p className="text-xs text-muted-foreground/60">{t("projects.detail.noIssues")}</p>
          </div>
        )}
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
  const [color, setColor] = useState("#6366f1")
  const [loading, setLoading] = useState(false)
  const { createStatus } = useIssueStore()

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    const created = await createStatus(workspaceSlug, projectId, { name: trimmed, category, color })
    setLoading(false)
    if (!created) {
      // On ne ferme/réinitialise le formulaire que si la colonne a bien été créée ; sinon on toaste
      // l'échec et on laisse l'utilisateur réessayer (la nouvelle colonne apparaissant = succès visible).
      toast.error("Couldn't create column")
      return
    }
    setName("")
    setCategory("UNSTARTED")
    setColor("#6366f1")
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
          <span className="text-xs font-medium">New column</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <p className="text-sm font-semibold mb-3">Create a column</p>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Column name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-8 text-sm"
            autoFocus
          />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Category</p>
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
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <Button size="sm" className="w-full" onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? "Creating…" : "Create"}
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const workspace = extractParam(params.workspace)
  const projectId = Number(extractParam(params.id))

  /** Deep-link `?issue=<id>` : on arrive sur le board et l'issue s'ouvre en sheet. */
  const deepLinkedIssueId = searchParams.get("issue")

  const { issues, statuses, error, fetchIssues, fetchStatuses, createStatus, clearIssues, updateIssue, deleteStatus, updateStatus } = useIssueStore()

  // Temps réel : le board se met à jour en direct sur les events d'issues (PROD-1.6)
  useProjectRealtime(projectId || null)

  const [initializing, setInitializing] = useState(true)
  const [selectedIssue, setSelectedIssue] = useState<SheetIssue | null>(null)
  const [overColumnId, setOverColumnId] = useState<number | null>(null)
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null)
  const [filters, setFilters] = useState<IssueFilterState>(EMPTY_ISSUE_FILTERS)

  const sensors = useSensors(
    // Distance d'activation : un simple clic ouvre l'issue, un glissé > 6px déclenche le drag
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // `?issue=<id>` → ouvre la sheet dès que les issues sont chargées. Un lien vers une issue
  // (décision IA, notification, lien copié) ramène donc sur le board, pas sur une page isolée.
  //
  // Le lien est consommé **une seule fois**, et le paramètre retiré aussitôt : sans cela, le
  // temps réel (`useProjectRealtime`) rafraîchit `issues`, l'effet se rejoue, et rouvre l'issue
  // du lien par-dessus celle que l'utilisateur venait d'ouvrir.
  const deepLinkConsumed = useRef(false)
  useEffect(() => {
    if (!deepLinkedIssueId || deepLinkConsumed.current) return
    const target = issues.find((i) => String(i.id) === deepLinkedIssueId)
    if (!target) return
    deepLinkConsumed.current = true
    setSelectedIssue(toSheetIssue(target))
    router.replace(pathname, { scroll: false })
  }, [deepLinkedIssueId, issues, router, pathname])

  useEffect(() => {
    if (!workspace || !projectId) return
    clearIssues()
    setInitializing(true)
    void (async () => {
      try {
        const loaded = await fetchStatuses(workspace, projectId)
        await fetchIssues(workspace, projectId)
        // Fallback : seed côté front si le backend n'a rien retourné
        if (loaded.length === 0) {
          const defaults: Array<{ name: string; category: IssueStatusCategory; color: string }> = [
            { name: "Backlog",     category: "BACKLOG",   color: "#94a3b8" },
            { name: "Todo",        category: "UNSTARTED", color: "#6366f1" },
            { name: "In Progress", category: "STARTED",   color: "#f59e0b" },
            { name: "Done",        category: "COMPLETED", color: "#10b981" },
          ]
          for (const s of defaults) {
            await createStatus(workspace, projectId, s)
          }
        }
      } finally {
        setInitializing(false)
      }
    })()
  }, [workspace, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses]
  )

  const issuesByStatus = useMemo(() => {
    const map = new Map<number, Issue[]>()
    for (const s of statuses) map.set(s.id, [])
    for (const issue of applyIssueFilters(issues, filters)) {
      const col = map.get(issue.status.id)
      if (col) col.push(issue)
    }
    return map
  }, [issues, statuses, filters])

  async function handleStatusChange(issueId: number, statusId: number) {
    if (!workspace) return
    // Succès muet : la carte change de colonne (UI). On ne signale que l'échec (updateIssue → null).
    const ok = await updateIssue(workspace, projectId, issueId, { statusId })
    if (!ok) toast.error("Couldn't move issue")
  }

  async function handleDeleteStatus(statusId: number) {
    if (!workspace) return
    // Échec fréquent : 409 quand la colonne contient encore des issues.
    const ok = await deleteStatus(workspace, projectId, statusId)
    if (!ok) toast.error("Couldn't delete column - move its issues first")
  }

  async function handleRenameStatus(statusId: number, name: string) {
    if (!workspace) return
    const ok = await updateStatus(workspace, projectId, statusId, { name })
    if (!ok) toast.error("Couldn't rename column")
  }

  async function handleChangeColor(statusId: number, color: string) {
    if (!workspace) return
    const ok = await updateStatus(workspace, projectId, statusId, { color })
    if (!ok) toast.error("Couldn't update column color")
  }

  function handleDragStart(event: DragStartEvent) {
    setOverColumnId(null)
    const data = event.active.data.current as { issueId?: number } | undefined
    setActiveIssue(issues.find((i) => i.id === data?.issueId) ?? null)
  }

  function handleDragOver(event: DragEndEvent) {
    const overData = event.over?.data.current as { statusId?: number } | undefined
    setOverColumnId(overData?.statusId ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setOverColumnId(null)
    setActiveIssue(null)
    const activeData = event.active.data.current as { issueId?: number; statusId?: number } | undefined
    const overData = event.over?.data.current as { statusId?: number } | undefined
    if (!workspace || !activeData?.issueId || !overData?.statusId) return
    if (activeData.statusId === overData.statusId) return
    // Succès muet : la carte se déplace dans sa nouvelle colonne (UI). On ne signale que l'échec.
    const ok = await updateIssue(workspace, projectId, activeData.issueId, { statusId: overData.statusId })
    if (!ok) toast.error("Couldn't move issue")
  }

  // Export COMPLET du projet (serveur) - issues + descriptions + commentaires + activité (P1b bêta).
  // Barre de progression (progression réelle du téléchargement) au lieu d'un simple appel muet.
  async function exportProject(format: "csv" | "json") {
    if (!workspace) return
    const progress = notifyProgress(`Exporting ${format.toUpperCase()}`, {
      description: "Preparing your project export…",
    })
    try {
      await downloadProjectExport(workspace, projectId, format, (pct) => progress.setProgress(pct))
      progress.success("Export ready")
    } catch {
      progress.error("Export failed. Please try again.")
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <InlineIssueFilters issues={issues} value={filters} onChange={setFilters} />
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={issues.length === 0}>
                <Download className="size-3.5" />
                Export
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Export complet du projet</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void exportProject("csv")}>CSV (issues + détails)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportProject("json")}>JSON (complet)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <BulkAssignDialog slug={workspace} projectId={projectId} issues={issues} />
        </div>
      </div>

      {/* Error banner */}
      {error && !initializing && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive flex items-center justify-between">
          <span>Error ({workspace}/{projectId}): {error}</span>
          <button
            type="button"
            className="ml-4 underline hover:no-underline"
            onClick={() => {
              clearIssues()
              setInitializing(true)
              void fetchStatuses(workspace, projectId).then(() => fetchIssues(workspace, projectId)).finally(() => setInitializing(false))
            }}
          >
            Retry
          </button>
        </div>
      )}

      {initializing ? (
        <div className="flex min-h-0 flex-1 gap-5 overflow-hidden">
          {Array.from({ length: 4 }).map((_, c) => (
            <div key={c} className="flex w-70 shrink-0 flex-col gap-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="mb-1 h-0.5 w-full" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setOverColumnId(null); setActiveIssue(null) }}
        >
          <div className="flex min-h-0 flex-1 items-stretch gap-5 overflow-x-auto pb-2">
            {sortedStatuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                issues={issuesByStatus.get(status.id) ?? []}
                statuses={sortedStatuses}
                onStatusChange={handleStatusChange}
                onDeleteStatus={handleDeleteStatus}
                onRenameStatus={handleRenameStatus}
                onChangeColor={handleChangeColor}
                onOpenIssue={(issue) => setSelectedIssue(toSheetIssue(issue))}
                isOver={overColumnId === status.id}
                t={t}
              />
            ))}
            <AddColumnPopover workspaceSlug={workspace} projectId={projectId} />
          </div>

          {/* Clone qui suit le curseur - DnD fluide (QA2-14) */}
          <DragOverlay dropAnimation={null}>
            {activeIssue ? <IssueCardPreview issue={activeIssue} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <IssueSheet
        issue={selectedIssue}
        open={selectedIssue !== null}
        onOpenChange={(open) => { if (!open) setSelectedIssue(null) }}
        workspaceSlug={workspace}
        projectId={projectId}
      />
    </div>
  )
}
