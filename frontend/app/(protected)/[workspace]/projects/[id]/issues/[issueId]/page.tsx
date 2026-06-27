"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronRight,
  CircleDot,
  Clock,
  CheckCircle2,
  Calendar,
  User,
  RefreshCw,
  Paperclip,
  MoreHorizontal,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  Pencil,
  Check as CheckIcon,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Link as LinkIcon,
  Hash,
  Layers,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import { AttachmentsTab, SubtasksTab } from "@/components/sheets/issue-sheet"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-service"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
import type {
  IssuePriority,
  IssueStatusCategory,
  IssueComment,
  IssueActivity,
} from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Display mappings
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<IssueStatusCategory, { icon: React.ReactNode; label: string; badgeClass: string }> = {
  BACKLOG: {
    icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />,
    label: "Backlog",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  UNSTARTED: {
    icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />,
    label: "Todo",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  STARTED: {
    icon: <RefreshCw className="h-3.5 w-3.5 text-blue-400" />,
    label: "In Progress",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
    label: "Done",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  CANCELLED: {
    icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    label: "Cancelled",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
}

const PRIORITY_CONFIG: Record<IssuePriority, { label: string; dotClass: string }> = {
  URGENT: { label: "Urgent",      dotClass: "bg-red-500" },
  HIGH:   { label: "High",        dotClass: "bg-orange-400" },
  MEDIUM: { label: "Medium",      dotClass: "bg-amber-400" },
  LOW:    { label: "Low",         dotClass: "bg-blue-400" },
  NONE:   { label: "No priority", dotClass: "bg-muted-foreground" },
}

const ACTIVITY_LABELS: Partial<Record<string, string>> = {
  CREATED:              "created this issue",
  STATUS_CHANGED:       "changed status",
  PRIORITY_CHANGED:     "changed priority",
  ASSIGNEE_CHANGED:     "changed assignee",
  TYPE_CHANGED:         "changed type",
  TITLE_CHANGED:        "changed title",
  DESCRIPTION_CHANGED:  "updated description",
  LABEL_ADDED:          "added label",
  LABEL_REMOVED:        "removed label",
  DUE_DATE_CHANGED:     "changed due date",
  START_DATE_CHANGED:   "changed start date",
  PARENT_CHANGED:       "changed parent",
  COMMENT_ADDED:        "added a comment",
  COMMENT_DELETED:      "deleted a comment",
  COMPLETED:            "completed this issue",
  REOPENED:             "reopened this issue",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const hours = diff / 3_600_000
    if (hours < 1) return "just now"
    if (hours < 24) return `${Math.floor(hours)}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return iso
  }
}

function getActivityText(item: IssueActivity): string {
  const label = ACTIVITY_LABELS[item.action] ?? item.action.toLowerCase().replaceAll("_", " ")
  if (item.oldValue && item.newValue) return `${label}: "${item.oldValue}" → "${item.newValue}"`
  if (item.newValue) return `${label}: "${item.newValue}"`
  return label
}

// ---------------------------------------------------------------------------
// Unified timeline entry
// ---------------------------------------------------------------------------

type TimelineEntry =
  | { kind: "comment"; data: IssueComment }
  | { kind: "event";   data: IssueActivity }

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IssueDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const workspace = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id      === "string" ? Number(params.id)      : 0
  const issueId   = typeof params.issueId === "string" ? Number(params.issueId) : 0

  const {
    fetchIssue, fetchComments, fetchActivity,
    addComment, deleteComment, deleteIssue,
    updateIssue, archiveIssue, pinIssue, fetchStatuses, statuses,
    activeIssue, comments, activity, isLoading, error,
  } = useIssueStore()
  const { activeProject } = useProjectStore()
  const { user }          = useUserStore()

  const [commentValue, setCommentValue] = useState("")
  const [isSaving, setIsSaving]         = useState(false)

  // Édition inline (vue riche canonique)
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [editingTitle, setEditingTitle]     = useState(false)
  const [titleDraft, setTitleDraft]         = useState("")
  const [editingDesc, setEditingDesc]       = useState(false)
  const [descDraft, setDescDraft]           = useState("")
  const [editingDue, setEditingDue]         = useState(false)
  const [deleteOpen, setDeleteOpen]         = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspace || !projectId || !issueId) return
    fetchIssue(workspace, projectId, issueId)
    fetchComments(workspace, projectId, issueId)
    fetchActivity(workspace, projectId, issueId)
    fetchStatuses(workspace, projectId).catch(() => null)
    listProjectMembers(workspace, projectId).then(setProjectMembers).catch(() => null)
  }, [workspace, projectId, issueId, fetchIssue, fetchComments, fetchActivity, fetchStatuses])

  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  const patch = useCallback(async (payload: Parameters<typeof updateIssue>[3]) => {
    const res = await updateIssue(workspace, projectId, issueId, payload)
    if (!res) toast.error("Échec de l'enregistrement")
    return res
  }, [workspace, projectId, issueId, updateIssue])

  const handleAddComment = useCallback(async () => {
    if (!commentValue.trim()) return
    setIsSaving(true)
    const result = await addComment(workspace, projectId, issueId, commentValue.trim())
    if (result) {
      setCommentValue("")
      toast.success("Commentaire ajouté")
    } else {
      toast.error("Erreur lors de l'ajout du commentaire")
    }
    setIsSaving(false)
  }, [commentValue, workspace, projectId, issueId, addComment])

  const handleDeleteIssue = useCallback(async () => {
    await deleteIssue(workspace, projectId, issueId)
    toast.success("Issue supprimée")
    router.push(`/${workspace}/projects/${projectId}/issues`)
  }, [workspace, projectId, issueId, deleteIssue, router])

  const handleDeleteComment = useCallback(async (commentId: number) => {
    await deleteComment(workspace, projectId, issueId, commentId)
    toast.success("Commentaire supprimé")
  }, [workspace, projectId, issueId, deleteComment])

  const handleTogglePin = useCallback(async () => {
    const res = await pinIssue(workspace, projectId, issueId, !(activeIssue?.pinned ?? false))
    if (res) toast.success(res.pinned ? "Issue épinglée" : "Issue dépinglée")
  }, [workspace, projectId, issueId, pinIssue, activeIssue?.pinned])

  const handleArchive = useCallback(async () => {
    const res = await archiveIssue(workspace, projectId, issueId, !(activeIssue?.archived ?? false))
    if (res) {
      toast.success(res.archived ? "Issue archivée" : "Issue désarchivée")
      if (res.archived) router.push(`/${workspace}/projects/${projectId}/issues`)
    }
  }, [workspace, projectId, issueId, archiveIssue, activeIssue?.archived, router])

  async function copyToClipboard(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(label) }
    catch { toast.error("Copie impossible") }
  }

  // Merge comments + activity events, sorted chronologically
  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [
      ...comments.map((c) => ({ kind: "comment" as const, data: c })),
      ...activity.map((a) => ({ kind: "event"   as const, data: a })),
    ]
    return entries.sort((a, b) =>
      new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
    )
  }, [comments, activity])

  if (isLoading && !activeIssue) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !activeIssue) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (!activeIssue) return null

  const issue          = activeIssue
  const statusConfig   = STATUS_CONFIG[issue.status.category]
  const priorityConfig = PRIORITY_CONFIG[issue.priority]

  return (
    <div className="flex flex-col gap-0 max-w-5xl mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <Link href={`/${workspace}/projects`} className="hover:text-foreground transition-colors">Projects</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/${workspace}/projects/${projectId}`} className="hover:text-foreground transition-colors">
          {activeProject?.name ?? `Project ${projectId}`}
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
              {editingTitle ? (
                <input
                  ref={titleRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={async () => { setEditingTitle(false); if (titleDraft.trim() && titleDraft !== issue.title) { await patch({ title: titleDraft.trim() }); toast.success("Titre mis à jour") } }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                    if (e.key === "Escape") { setTitleDraft(issue.title); setEditingTitle(false) }
                  }}
                  className="flex-1 text-xl font-semibold text-foreground leading-snug bg-transparent border-b-2 border-primary outline-none pb-0.5"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => { setTitleDraft(issue.title); setEditingTitle(true) }}
                  className="group flex flex-1 items-start gap-2 text-left text-xl font-semibold text-foreground leading-snug rounded px-1 -mx-1 hover:bg-muted/50 transition-colors"
                  title="Cliquer pour éditer"
                >
                  <span className="flex-1">{issue.title}</span>
                  <Pencil className="size-3.5 mt-1 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                </button>
              )}

              {issue.pinned && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                  <Pin className="size-3" /> Épinglée
                </span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem className="gap-2 text-xs" onClick={() => copyToClipboard(window.location.href, "Lien copié")}>
                    <LinkIcon className="size-3.5" /> Copier le lien
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 text-xs" onClick={() => copyToClipboard(issue.identifier, "Identifiant copié")}>
                    <Hash className="size-3.5" /> {`Copier l'ID (${issue.identifier})`}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-xs" onClick={handleTogglePin}>
                    {issue.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    {issue.pinned ? "Désépingler" : "Épingler"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 text-xs" onClick={handleArchive}>
                    {issue.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                    {issue.archived ? "Désarchiver" : "Archiver"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-xs text-destructive focus:text-destructive"
                    onSelect={(e) => { e.preventDefault(); setDeleteOpen(true) }}
                  >
                    <Trash2 className="size-3.5" /> Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DeleteConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Supprimer l'issue ?"
                description={`« ${issue.title} » sera définitivement supprimée. Cette action est irréversible.`}
                confirmLabel="Supprimer"
                onConfirm={handleDeleteIssue}
              />
            </div>

            {/* Quick meta row */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("flex items-center gap-1.5 text-xs border px-2 py-0.5", statusConfig.badgeClass)}>
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={cn("h-2 w-2 rounded-full", priorityConfig.dotClass)} />
                {priorityConfig.label}
              </div>
              {issue.labels.map((label) => (
                <Badge key={label.id} variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-muted/60 text-muted-foreground border-0 font-normal">
                  {label.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Description — éditable inline */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
            {editingDesc ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={6}
                  autoFocus
                  className="w-full rounded-md border border-primary/50 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/20 resize-none"
                  placeholder="Ajouter une description…"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={async () => { setEditingDesc(false); await patch({ description: descDraft }); toast.success("Description mise à jour") }}>
                    <CheckIcon className="size-3" /> Enregistrer
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDesc(false)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setDescDraft(issue.description ?? ""); setEditingDesc(true) }}
                className="group relative w-full rounded-xl border border-border bg-card p-4 text-left [box-shadow:var(--shadow-sm)] hover:border-primary/30 transition-colors"
                title="Cliquer pour éditer"
              >
                {issue.description
                  ? <span className="prose prose-sm prose-invert max-w-none text-sm text-foreground leading-relaxed whitespace-pre-wrap">{issue.description}</span>
                  : <span className="text-sm italic text-muted-foreground">Aucune description. Cliquer pour en ajouter une.</span>}
                <Pencil className="size-3.5 absolute top-3 right-3 opacity-0 group-hover:opacity-40 transition-opacity" />
              </button>
            )}
          </div>

          {/* Sous-tâches */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Sous-tâches</span>
            </div>
            <SubtasksTab issueId={issueId} projectId={projectId} workspaceSlug={workspace} />
          </div>

          {/* Pièces jointes — réelles */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Pièces jointes</span>
            </div>
            <AttachmentsTab issueId={issueId} projectId={projectId} workspaceSlug={workspace} />
          </div>

          <Separator />

          {/* Activity */}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">Activity</h2>

            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {timeline.map((entry) => {
                  if (entry.kind === "comment") {
                    const c = entry.data
                    const isMe = user?.email === c.author.email
                    return (
                      <div key={`comment-${c.id}`} className="flex gap-3">
                        <UserAvatar
                          email={c.author.email}
                          name={c.author.displayName ?? c.author.email}
                          className="h-7 w-7 shrink-0 mt-0.5"
                          fallbackClassName="text-[10px] font-medium"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-medium text-foreground">
                              {c.author.displayName ?? c.author.email}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatRelative(c.createdAt)}</span>
                            {c.isEdited && <span className="text-xs text-muted-foreground italic">(edited)</span>}
                            {isMe && (
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c.id)}
                                className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                                aria-label="Delete comment"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground leading-relaxed">
                            {c.content}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // event entry
                  const a = entry.data
                  const actorName = a.actor ? (a.actor.displayName ?? a.actor.email) : "System"
                  return (
                    <div key={`event-${a.id}`} className="flex gap-3">
                      <UserAvatar
                        email={a.actor?.email}
                        name={actorName}
                        className="h-7 w-7 shrink-0 mt-0.5"
                        fallbackClassName="text-[10px] font-medium"
                      />
                      <div className="flex items-center gap-2 py-1 flex-1 min-w-0">
                        <span className="text-xs font-medium text-foreground">{actorName}</span>
                        <span className="text-xs text-muted-foreground truncate">{getActivityText(a)}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatRelative(a.createdAt)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Comment input */}
            <div className="flex gap-3 mt-2">
              <UserAvatar
                email={user?.email}
                name={user?.displayName ?? user?.email}
                className="h-7 w-7 shrink-0 mt-0.5"
                fallbackClassName="text-[10px] font-medium"
              />
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-20"
                  placeholder="Add a comment… (Ctrl+Enter to submit)"
                  value={commentValue}
                  onChange={(e) => setCommentValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleAddComment()
                    }
                  }}
                />
                {commentValue.trim() && (
                  <div className="flex justify-end">
                    <Button size="sm" className="h-8 text-xs" onClick={handleAddComment} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
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
            <Select
              value={String(issue.status.id)}
              onValueChange={async (val) => {
                const s = statuses.find((x) => String(x.id) === val)
                if (!s) return
                await patch({ statusId: s.id })
                toast.success(`Status → ${s.name}`)
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: statuses.find((s) => s.id === issue.status.id)?.color ?? "#94a3b8" }} />
                  {issue.status.name}
                </span>
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SidebarSection>

          <SidebarSection label="Priority">
            <Select
              value={issue.priority}
              onValueChange={async (p) => { await patch({ priority: p as IssuePriority }); toast.success(`Priority → ${PRIORITY_CONFIG[p as IssuePriority].label}`) }}
            >
              <SelectTrigger size="sm" className="w-full">
                <span className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full shrink-0", priorityConfig.dotClass)} />
                  {priorityConfig.label}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_CONFIG) as IssuePriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={cn("size-2.5 rounded-full shrink-0", PRIORITY_CONFIG[p].dotClass)} />
                    {PRIORITY_CONFIG[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SidebarSection>

          <SidebarSection label="Assignee">
            <Select
              value={issue.assignee ? String(issue.assignee.id) : "none"}
              onValueChange={async (val) => {
                if (val === "none") { await patch({ assigneeId: null }); toast.success("Unassigned"); return }
                const m = projectMembers.find((x) => String(x.userId) === val)
                if (!m) return
                await patch({ assigneeId: m.userId })
                toast.success(`Assigned to ${m.displayName ?? m.email}`)
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                {issue.assignee ? (
                  <span className="flex items-center gap-2 min-w-0">
                    <UserAvatar email={issue.assignee.email} name={issue.assignee.displayName ?? issue.assignee.email} className="size-5 shrink-0" fallbackClassName="text-[9px]" />
                    <span className="truncate">{issue.assignee.displayName ?? issue.assignee.email}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" />Unassigned</span>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none"><span className="text-muted-foreground">No assignee</span></SelectItem>
                {projectMembers.map((m) => {
                  const name = m.displayName ?? m.email
                  return (
                    <SelectItem key={m.userId} value={String(m.userId)}>
                      <UserAvatar email={m.email} name={name} avatarUrl={m.avatarUrl} className="size-5 shrink-0" fallbackClassName="text-[9px]" />
                      {name}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </SidebarSection>

          <SidebarSection label="Reporter">
            <div className="flex items-center gap-2">
              <UserAvatar
                email={issue.reporter.email}
                name={issue.reporter.displayName ?? issue.reporter.email}
                className="h-6 w-6"
                fallbackClassName="text-[9px] font-medium"
              />
              <span className="text-sm text-foreground">{issue.reporter.displayName ?? issue.reporter.email}</span>
            </div>
          </SidebarSection>

          <SidebarSection label="Due date">
            {editingDue ? (
              <input
                type="date"
                defaultValue={issue.dueDate ? issue.dueDate.slice(0, 10) : ""}
                autoFocus
                onBlur={async (e) => { setEditingDue(false); await patch({ dueDate: e.target.value || null }); toast.success("Échéance mise à jour") }}
                className="w-full text-sm bg-background border border-border rounded px-2 h-8 outline-none focus:border-primary/50 scheme-dark"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDue(true)}
                className="group flex w-full items-center gap-2 text-left text-sm rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors"
                title="Cliquer pour éditer"
              >
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className={cn("flex-1", issue.dueDate ? "text-foreground" : "text-muted-foreground")}>
                  {issue.dueDate ? formatDate(issue.dueDate) : "No due date"}
                </span>
                <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
              </button>
            )}
          </SidebarSection>

          <SidebarSection label="Labels">
            {issue.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <div key={label.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                    {label.name}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No labels</span>
            )}
          </SidebarSection>

          {issue.type && (
            <SidebarSection label="Type">
              <span className="text-sm text-foreground">{issue.type.name}</span>
            </SidebarSection>
          )}

          <Separator />

          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Created {formatDate(issue.createdAt)}</span>
            <span>Updated {formatDate(issue.updatedAt)}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
