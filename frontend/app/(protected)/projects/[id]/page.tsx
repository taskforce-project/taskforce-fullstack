"use client"

import { useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"
import {
  CircleDot,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  MoreHorizontal,
  Pencil,
} from "lucide-react"

import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
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
  headerColor: string
  issues: BoardIssue[]
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
  none: "bg-muted-foreground/30",
}

const INITIAL_COLUMNS: BoardColumn[] = [
  {
    id: "todo",
    title: "To Do",
    icon: <CircleDot className="size-3.5 text-muted-foreground" />,
    headerColor: "text-muted-foreground",
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
    icon: <RefreshCw className="size-3.5 text-blue-400" />,
    headerColor: "text-blue-400",
    issues: [
      { id: "p1", identifier: "TF-29", title: "Implement dark mode toggle", priority: "low", assignee: { initials: "ME", color: "bg-primary" }, labels: ["ui"] },
      { id: "p2", identifier: "TF-32", title: "Responsive navigation redesign", priority: "high", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["ui", "mobile"] },
      { id: "p3", identifier: "TF-38", title: "SEO meta tags refactor", priority: "medium", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["seo"] },
    ],
  },
  {
    id: "in_review",
    title: "In Review",
    icon: <Clock className="size-3.5 text-yellow-400" />,
    headerColor: "text-yellow-400",
    issues: [
      { id: "r1", identifier: "TF-22", title: "Analytics integration with Plausible", priority: "medium", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["analytics"] },
      { id: "r2", identifier: "TF-25", title: "Accessibility audit — WCAG 2.1 AA", priority: "high", assignee: { initials: "ME", color: "bg-primary" }, labels: ["a11y"] },
    ],
  },
  {
    id: "done",
    title: "Done",
    icon: <CheckCircle2 className="size-3.5 text-emerald-400" />,
    headerColor: "text-emerald-400",
    issues: [
      { id: "d1", identifier: "TF-11", title: "Set up Next.js 15 project", priority: "none", assignee: { initials: "ME", color: "bg-primary" }, labels: [] },
      { id: "d2", identifier: "TF-12", title: "Design system tokens (colors, typography)", priority: "none", assignee: { initials: "EP", color: "bg-emerald-500" }, labels: ["design"] },
      { id: "d3", identifier: "TF-14", title: "CI/CD pipeline with GitHub Actions", priority: "none", assignee: { initials: "SM", color: "bg-violet-500" }, labels: ["devops"] },
      { id: "d4", identifier: "TF-17", title: "SEO audit & initial fixes", priority: "none", assignee: { initials: "ME", color: "bg-primary" }, labels: ["seo"] },
      { id: "d5", identifier: "TF-19", title: "Privacy policy & terms pages", priority: "none", assignee: null, labels: ["legal"] },
    ],
  },
]

// ---------------------------------------------------------------------------
// IssueCard — pure display (no drag state, no navigation)
// ---------------------------------------------------------------------------

function IssueCard({ issue }: { readonly issue: BoardIssue }) {
  return (
    <div
      className="group block rounded-lg border border-border bg-background p-3 hover:border-primary/40 hover:bg-muted/20 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)]"
    >
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
      <p className="text-sm text-foreground leading-snug mb-3 group-hover:text-primary transition-colors line-clamp-2">
        {issue.title}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
          <span className="text-[11px] text-muted-foreground font-mono">{issue.identifier}</span>
        </div>
        {issue.assignee && (
          <Avatar className="size-5">
            <AvatarFallback className={cn("text-[9px] text-white", issue.assignee.color)}>
              {issue.assignee.initials}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DraggableCard — entire card is the drag source; click navigates to issue
// ---------------------------------------------------------------------------

function DraggableCard({ issue, projectId }: { readonly issue: BoardIssue; readonly projectId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id })
  const router = useRouter()

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("block w-full text-left cursor-grab active:cursor-grabbing", isDragging && "opacity-30 scale-[0.97] transition-transform")}
      onClick={() => router.push(`/projects/${projectId}/issues/${issue.identifier.toLowerCase().replace("-", "")}`)}
    >
      <IssueCard issue={issue} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// ColumnDropZone — each column is a drop target
// ---------------------------------------------------------------------------

function ColumnDropZone({
  column,
  projectId,
  isSource,
  t,
  onRenameColumn,
}: {
  readonly column: BoardColumn
  readonly projectId: string
  readonly isSource: boolean
  readonly t: (k: string) => string
  readonly onRenameColumn: (id: IssueStatus, title: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const showHighlight = isOver && !isSource
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(column.title)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraftTitle(column.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 10)
  }

  function commitEdit() {
    const trimmed = draftTitle.trim()
    if (trimmed && trimmed !== column.title) {
      onRenameColumn(column.id, trimmed)
    }
    setEditing(false)
  }

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {column.icon}
          {editing ? (
            <input
              ref={inputRef}
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit()
                if (e.key === "Escape") setEditing(false)
              }}
              className={cn(
                "text-sm font-medium bg-transparent border-b border-primary outline-none w-full min-w-0 pb-0.5",
                column.headerColor
              )}
            />
          ) : (
            <span
              className={cn("text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity", column.headerColor)}
              onDoubleClick={startEdit}
              title="Double-clic pour renommer"
            >
              {column.title}
            </span>
          )}
          <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs bg-muted text-muted-foreground border-0 shrink-0">
            {column.issues.length}
          </Badge>
          <button
            type="button"
            onClick={startEdit}
            className="opacity-0 group-hover/col:opacity-60 hover:opacity-100! transition-opacity p-0.5 rounded hover:bg-muted/60 shrink-0"
            title="Renommer la colonne"
          >
            <Pencil className="size-3" />
          </button>
        </div>
        <CreateIssueDialog defaultStatus={column.id}>
          <Button variant="ghost" size="sm" className="size-6 p-0 opacity-60 hover:opacity-100">
            <Plus className="size-3.5" />
          </Button>
        </CreateIssueDialog>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 flex-1 min-h-24 rounded-xl p-1.5 transition-all duration-150",
          showHighlight && "bg-primary/5 ring-1 ring-dashed ring-primary/30"
        )}
      >
        {column.issues.length === 0 ? (
          <div
            className={cn(
              "flex items-center justify-center rounded-lg border border-dashed p-6 transition-colors",
              showHighlight ? "border-primary/40 bg-primary/5" : "border-border"
            )}
          >
            <p className="text-xs text-muted-foreground">{t("projects.detail.noIssues")}</p>
          </div>
        ) : (
          <>
            {column.issues.map((issue: BoardIssue) => (
              <DraggableCard key={issue.id} issue={issue} projectId={projectId} />
            ))}
            {showHighlight && <div className="h-1 rounded-full bg-primary/30 mx-2 mt-1" />}
          </>
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

  const [columns, setColumns] = useState<BoardColumn[]>(INITIAL_COLUMNS)
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null)
  const [sourceColId, setSourceColId] = useState<IssueStatus | null>(null)

  function handleRenameColumn(id: IssueStatus, title: string) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    const col = columns.find((c) => c.issues.some((i) => i.id === id))
    if (!col) return
    setActiveIssue(col.issues.find((i) => i.id === id) ?? null)
    setSourceColId(col.id)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveIssue(null)
    setSourceColId(null)
    if (!over) return

    const targetColId = over.id as IssueStatus
    const sourceCol = columns.find((c) => c.issues.some((i) => i.id === active.id))
    if (!sourceCol || sourceCol.id === targetColId) return

    const issue = sourceCol.issues.find((i) => i.id === active.id)
    if (!issue) return

    const nextColumns = columns.map((c) => {
      if (c.id === sourceCol.id) return { ...c, issues: c.issues.filter((i) => i.id !== active.id) }
      if (c.id === targetColId) return { ...c, issues: [...c.issues, issue] }
      return c
    })
    setColumns(nextColumns)
  }

  function handleDragCancel() {
    setActiveIssue(null)
    setSourceColId(null)
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <AlertTriangle className="size-3.5" />
            Filters
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <MoreHorizontal className="size-3.5" />
            Group by
          </Button>
        </div>
      </div>

      {/* Kanban board with drag & drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 md:-mx-6 px-4 md:px-6">
          {columns.map((col) => (
            <ColumnDropZone
              key={col.id}
              column={col}
              projectId={projectId}
              isSource={col.id === sourceColId}
              t={t}
              onRenameColumn={handleRenameColumn}
            />
          ))}
        </div>

        {/* Drag overlay — card clone that follows the cursor */}
        <DragOverlay>
          {activeIssue ? (
            <div className="w-72 rotate-1 opacity-95 shadow-2xl ring-1 ring-primary/20 rounded-lg cursor-grabbing">
              <IssueCard issue={activeIssue} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
