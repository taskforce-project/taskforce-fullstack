"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  X, RefreshCw, Clock, CheckCircle2, AlertTriangle, CircleDot,
  Flag, Tag, Calendar, Layers, GitBranch, MessageSquare, Activity,
  ChevronDown, Send, ExternalLink, Pencil, Check as CheckIcon,
  Paperclip, Upload, Trash2, FileText, Link2, Plus,
} from "lucide-react"
import { toast } from "sonner"

import {
  Sheet, SheetContent, SheetClose, SheetTitle,
} from "@/components/ui/sheet"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { SmartAssignPanel } from "@/components/smart-assign/smart-assign-panel"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  formatFileSize,
  type Attachment,
} from "@/lib/api/attachment-service"
import { useIssueStore } from "@/lib/store/issue-store"
import { useLabelStore } from "@/lib/store/label-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-service"
import type { IssueComment, IssueLabel, IssueStatus as ApiIssueStatus, Issue, IssueRelation, IssueRelationType, ChecklistItem } from "@/lib/api/issue-service"
import { listChildIssues, listRelations, addRelation, deleteRelation,
         listChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssuePriority     = "NONE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW"
export type IssueStatusCategory = "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELLED"

export interface SheetIssue {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  statusId: number
  statusName: string
  statusCategory: IssueStatusCategory
  assignee: { initials: string; color: string; name: string; userId: number; email?: string | null } | null
  assigneeId: number | null
  labels: IssueLabel[]
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
  URGENT:  { dot: "bg-red-400",               label: "Urgent" },
  HIGH:    { dot: "bg-orange-400",             label: "High" },
  MEDIUM:  { dot: "bg-yellow-400",             label: "Medium" },
  LOW:     { dot: "bg-slate-400",              label: "Low" },
  NONE:    { dot: "bg-muted-foreground/30",    label: "None" },
}

const STATUS_CATEGORY_CONFIG: Record<IssueStatusCategory, { icon: React.ReactNode; label: string; color: string }> = {
  BACKLOG:   { icon: <CircleDot className="size-3.5" />,    label: "Backlog",     color: "text-muted-foreground" },
  UNSTARTED: { icon: <CircleDot className="size-3.5" />,    label: "Todo",        color: "text-muted-foreground" },
  STARTED:   { icon: <RefreshCw className="size-3.5" />,    label: "In Progress", color: "text-blue-400" },
  COMPLETED: { icon: <CheckCircle2 className="size-3.5" />, label: "Done",        color: "text-emerald-400" },
  CANCELLED: { icon: <X className="size-3.5" />,            label: "Cancelled",   color: "text-muted-foreground" },
}

function getStatusCfg(category: IssueStatusCategory) {
  return STATUS_CATEGORY_CONFIG[category] ?? STATUS_CATEGORY_CONFIG.BACKLOG
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]
function memberColor(id: number): string { return AVATAR_COLORS[id % AVATAR_COLORS.length] }
function memberInitials(m: ProjectMember): string {
  if (m.displayName) return m.displayName.slice(0, 2).toUpperCase()
  return m.email.slice(0, 2).toUpperCase()
}
function formatActivityTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  } catch { return iso }
}
function formatCommentTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  } catch { return iso }
}

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
// Sub-component: GitHub links tab
// ---------------------------------------------------------------------------

function GitHubTab({ issueId, workspaceSlug }: Readonly<{ issueId: number; workspaceSlug: string }>) {
  const { githubStatus, githubLinks, fetchGitHubLinks, addGitHubLink, removeGitHubLink } = useIntegrationStore()
  const links = githubLinks[issueId] ?? []
  const [loading, setLoading] = useState(false)

  // Add-link form state
  const [showForm, setShowForm] = useState(false)
  const [linkType,      setLinkType]      = useState<"PR" | "COMMIT">("PR")
  const [repoFullName,  setRepoFullName]  = useState("")
  const [prNumber,      setPrNumber]      = useState("")
  const [prUrl,         setPrUrl]         = useState("")
  const [commitSha,     setCommitSha]     = useState("")
  const [commitUrl,     setCommitUrl]     = useState("")
  const [linkTitle,     setLinkTitle]     = useState("")
  const [submitting,    setSubmitting]    = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchGitHubLinks(workspaceSlug, issueId).catch(() => null).finally(() => setLoading(false))
  }, [workspaceSlug, issueId, fetchGitHubLinks])

  async function handleAdd() {
    setSubmitting(true)
    try {
      await addGitHubLink(workspaceSlug, issueId, {
        linkType,
        repoFullName: repoFullName.trim(),
        prNumber:    linkType === "PR"     ? Number(prNumber)  : undefined,
        prUrl:       linkType === "PR"     ? prUrl.trim()      : undefined,
        commitSha:   linkType === "COMMIT" ? commitSha.trim()  : undefined,
        commitUrl:   linkType === "COMMIT" ? commitUrl.trim()  : undefined,
        title: linkTitle.trim() || undefined,
      })
      toast.success("Lien GitHub ajouté")
      setShowForm(false)
      setRepoFullName(""); setPrNumber(""); setPrUrl(""); setCommitSha(""); setCommitUrl(""); setLinkTitle("")
    } catch {
      toast.error("Impossible d'ajouter le lien")
    } finally {
      setSubmitting(false)
    }
  }

  if (!githubStatus?.connected) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <GitBranch className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">GitHub not connected</p>
        <p className="text-xs text-muted-foreground/60">Connect GitHub in Workspace Settings → Integrations.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}

      {!loading && links.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4 italic">No GitHub links yet.</p>
      )}

      {links.map((link) => (
        <div key={link.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 text-muted-foreground">{link.linkType}</Badge>
                {link.status && (
                  <Badge variant="outline" className={cn("text-xs px-1.5 py-0 h-4",
                    link.status === "OPEN"   ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" :
                    link.status === "MERGED" ? "text-purple-400 border-purple-500/20 bg-purple-500/10" :
                    "text-muted-foreground"
                  )}>{link.status}</Badge>
                )}
                <span className="text-xs font-mono text-muted-foreground truncate">{link.repoFullName}</span>
                {link.prNumber && <span className="text-xs text-muted-foreground">#{link.prNumber}</span>}
                {link.commitSha && <span className="text-xs font-mono text-muted-foreground">{link.commitSha.slice(0,7)}</span>}
              </div>
              {link.title && <p className="text-xs text-foreground mt-0.5 truncate">{link.title}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(link.prUrl ?? link.commitUrl) && (
              <a
                href={link.prUrl ?? link.commitUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive transition-colors"
              onClick={async () => {
                try { await removeGitHubLink(workspaceSlug, issueId, link.id); toast.success("Lien supprimé") }
                catch { toast.error("Impossible de supprimer le lien") }
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Add link button / form */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <Plus className="size-3.5" />
          Add GitHub link
        </button>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {/* Type toggle */}
          <div className="flex gap-1">
            {(["PR", "COMMIT"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLinkType(t)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  linkType === t
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="owner/repo"
            value={repoFullName}
            onChange={(e) => setRepoFullName(e.target.value)}
          />
          {linkType === "PR" && (
            <>
              <input
                className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="PR number"
                type="number"
                value={prNumber}
                onChange={(e) => setPrNumber(e.target.value)}
              />
              <input
                className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="PR URL (optional)"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
              />
            </>
          )}
          {linkType === "COMMIT" && (
            <>
              <input
                className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Commit SHA"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
              />
              <input
                className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Commit URL (optional)"
                value={commitUrl}
                onChange={(e) => setCommitUrl(e.target.value)}
              />
            </>
          )}
          <input
            className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Title (optional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" disabled={!repoFullName || submitting} onClick={handleAdd}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: comments tab
// ---------------------------------------------------------------------------

interface CommentsTabProps {
  comments: IssueComment[]
  loading: boolean
  comment: string
  onChange: (v: string) => void
  onSend: () => void
  onDelete: (id: number) => void
}

function CommentsTab({ comments, loading, comment, onChange, onSend, onDelete }: Readonly<CommentsTabProps>) {
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") onSend()
  }
  return (
    <div className="flex flex-col gap-5">
      {loading && (
        <p className="text-xs text-muted-foreground text-center py-4">Loading comments…</p>
      )}
      {!loading && comments.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4 italic">No comments yet. Be the first!</p>
      )}
      {comments.map((c) => {
        return (
          <div key={c.id} className="flex gap-3">
            <UserAvatar
              email={c.author.email}
              name={c.author.displayName ?? c.author.email}
              avatarUrl={c.author.avatarUrl}
              className="size-7 shrink-0 mt-0.5"
              fallbackClassName="text-[9px]"
            />
            <div className="flex-1 min-w-0 rounded-lg border border-border bg-muted/20 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
                <span className="text-xs font-semibold text-foreground">
                  {c.author.displayName ?? c.author.email}
                </span>
                <span className="text-xs text-muted-foreground">{formatCommentTime(c.createdAt)}</span>
                {c.isEdited && <span className="text-[10px] text-muted-foreground/60 italic">(edited)</span>}
                <button
                  type="button"
                  className="ml-auto p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete comment"
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <p className="px-3 py-2.5 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{c.content}</p>
            </div>
          </div>
        )
      })}

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
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full px-3 py-2.5 text-sm text-foreground bg-transparent placeholder:text-muted-foreground outline-none"
          />
          {comment.trim() && (
            <div className="flex justify-end px-2 pb-2">
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={onSend}>
                <Send className="size-3" />
                Comment
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: attachments tab
// ---------------------------------------------------------------------------

interface AttachmentsTabProps {
  issueId: number
  projectId: number
  workspaceSlug: string
}

function AttachmentsTab({ issueId, projectId, workspaceSlug }: Readonly<AttachmentsTabProps>) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await listAttachments(workspaceSlug, projectId, issueId)
      setAttachments(data)
    } catch {
      toast.error("Could not load attachments")
    } finally {
      setLoading(false)
    }
  }, [workspaceSlug, projectId, issueId])

  useEffect(() => { void load() }, [load])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const created = await uploadAttachment(workspaceSlug, projectId, issueId, file)
      setAttachments((prev) => [created, ...prev])
      toast.success(`${file.name} uploaded`)
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleDelete(attachment: Attachment) {
    try {
      await deleteAttachment(workspaceSlug, projectId, issueId, attachment.id)
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
      toast.success("Attachment deleted")
    } catch {
      toast.error("Could not delete attachment")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload button */}
      <div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="*/*"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
        >
          <Upload className="size-3.5" />
          {uploading ? "Uploading…" : "Attach a file (max 25 MB)"}
        </button>
      </div>

      {/* List */}
      {loading && (
        <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
      )}
      {!loading && attachments.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4 italic">No attachments yet.</p>
      )}
      {!loading && attachments.length > 0 && (
        <div className="flex flex-col gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-foreground">{a.originalName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatFileSize(a.fileSize)} · {a.uploadedByName}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.downloadUrl && (
                  <a
                    href={a.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    title="Download"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(a)}
                  className="p-1 rounded hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function makeKeyHandler(
  onEnter?: () => void,
  onEscape?: () => void
): (e: React.KeyboardEvent) => void {
  return (e) => {
    if (e.key === "Enter") onEnter?.()
    if (e.key === "Escape") onEscape?.()
  }
}

/** Presets d'estimation (story points, façon Fibonacci) ; null = aucune estimation */
const STORY_POINT_PRESETS: (number | null)[] = [null, 1, 2, 3, 5, 8, 13]

function formatDueDateDraft(dueDate: string | null): string {
  if (!dueDate || dueDate === "Overdue") return ""
  return dueDate
}

// ─── Sous-tâches (PROD-2.1) ────────────────────────────────────────────────────
function SubtasksTab({
  issueId, projectId, workspaceSlug,
}: Readonly<{ issueId: number; projectId: number; workspaceSlug: string }>) {
  const createIssue = useIssueStore((s) => s.createIssue)
  const statuses = useIssueStore((s) => s.statuses)
  const [children, setChildren] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listChildIssues(workspaceSlug, projectId, issueId)
      .then(setChildren)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [workspaceSlug, projectId, issueId])

  useEffect(() => { refresh() }, [refresh])

  function defaultStatusId(): number | undefined {
    const s = statuses.find((x) => x.isDefault) ?? [...statuses].sort((a, b) => a.position - b.position)[0]
    return s?.id
  }

  async function add() {
    const trimmed = title.trim()
    if (!trimmed || adding) return
    setAdding(true)
    try {
      const created = await createIssue(workspaceSlug, projectId, {
        title: trimmed,
        parentId: issueId,
        statusId: defaultStatusId(),
      })
      if (created) {
        setTitle("")
        refresh()
        toast.success("Sous-tâche créée")
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Chargement…</p>}
      {!loading && children.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">Aucune sous-tâche.</p>
      )}
      {children.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
          <CircleDot className="size-3.5 shrink-0" style={{ color: c.status?.color }} />
          <span className="w-16 shrink-0 truncate font-mono text-[10px] text-muted-foreground">{c.identifier}</span>
          <span className="flex-1 truncate text-xs text-foreground">{c.title}</span>
          {c.assignee && (
            <UserAvatar
              email={c.assignee.email}
              name={c.assignee.displayName ?? c.assignee.email}
              avatarUrl={c.assignee.avatarUrl}
              className="size-5 shrink-0"
              fallbackClassName="text-[8px]"
            />
          )}
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder="Nouvelle sous-tâche…"
          className="h-8 flex-1 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:border-primary/50"
        />
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={add} disabled={!title.trim() || adding}>
          <Plus className="size-3.5" /> Ajouter
        </Button>
      </div>
    </div>
  )
}

// ─── Checklist (PROD-2.3) ───────────────────────────────────────────────────────
function ChecklistTab({
  issueId, projectId, workspaceSlug,
}: Readonly<{ issueId: number; projectId: number; workspaceSlug: string }>) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState("")
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listChecklist(workspaceSlug, projectId, issueId)
      .then(setItems)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [workspaceSlug, projectId, issueId])

  useEffect(() => { refresh() }, [refresh])

  const doneCount = items.filter((i) => i.done).length
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0

  async function add() {
    const c = content.trim()
    if (!c || adding) return
    setAdding(true)
    try {
      const item = await addChecklistItem(workspaceSlug, projectId, issueId, c)
      setItems((prev) => [...prev, item])
      setContent("")
    } catch {
      // client toast
    } finally {
      setAdding(false)
    }
  }

  async function toggle(item: ChecklistItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
    try {
      await updateChecklistItem(workspaceSlug, projectId, issueId, item.id, { done: !item.done })
    } catch {
      refresh()
    }
  }

  async function remove(item: ChecklistItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await deleteChecklistItem(workspaceSlug, projectId, issueId, item.id)
    } catch {
      refresh()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{doneCount}/{items.length}</span>
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Chargement…</p>}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">Aucun item de checklist.</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(item)}
            aria-label={item.done ? "Décocher" : "Cocher"}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
              item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:border-foreground/40"
            )}
          >
            {item.done && <CheckIcon className="size-3" />}
          </button>
          <span className={cn("flex-1 text-xs", item.done && "text-muted-foreground line-through")}>{item.content}</span>
          <button
            type="button"
            onClick={() => remove(item)}
            aria-label="Supprimer l'item"
            className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder="Ajouter un item…"
          className="h-8 flex-1 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:border-primary/50"
        />
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={add} disabled={!content.trim() || adding}>
          <Plus className="size-3.5" /> Ajouter
        </Button>
      </div>
    </div>
  )
}

// ─── Relations entre issues (PROD-2.2) ─────────────────────────────────────────
const RELATION_LABELS: Record<IssueRelationType, string> = {
  BLOCKS: "Blocks",
  BLOCKED_BY: "Blocked by",
  DUPLICATE: "Duplicate of",
  RELATES_TO: "Relates to",
}

function RelationsTab({
  issueId, projectId, workspaceSlug,
}: Readonly<{ issueId: number; projectId: number; workspaceSlug: string }>) {
  const issues = useIssueStore((s) => s.issues)
  const [relations, setRelations] = useState<IssueRelation[]>([])
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<IssueRelationType>("RELATES_TO")
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listRelations(workspaceSlug, projectId, issueId)
      .then(setRelations)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [workspaceSlug, projectId, issueId])

  useEffect(() => { refresh() }, [refresh])

  const candidates = issues.filter((i) => i.id !== issueId)

  async function add() {
    if (!targetId || adding) return
    setAdding(true)
    try {
      await addRelation(workspaceSlug, projectId, issueId, { targetIssueId: targetId, relationType: type })
      setTargetId(undefined)
      refresh()
      toast.success("Relation ajoutée")
    } catch {
      // erreur déjà notifiée par le client HTTP
    } finally {
      setAdding(false)
    }
  }

  async function remove(relationId: number) {
    try {
      await deleteRelation(workspaceSlug, projectId, issueId, relationId)
      refresh()
    } catch {
      // client toast
    }
  }

  const selectClass = "h-8 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:border-primary/50"

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Chargement…</p>}
      {!loading && relations.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">Aucune relation.</p>
      )}
      {relations.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
          <Badge variant="outline" className="text-[9px] shrink-0">{RELATION_LABELS[r.relationType]}</Badge>
          <span className="w-16 shrink-0 truncate font-mono text-[10px] text-muted-foreground">{r.relatedIssue.identifier}</span>
          <span className="flex-1 truncate text-xs text-foreground">{r.relatedIssue.title}</span>
          <button
            type="button"
            onClick={() => remove(r.id)}
            aria-label="Supprimer la relation"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}

      <div className="mt-1 flex items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as IssueRelationType)} className={selectClass}>
          {(Object.keys(RELATION_LABELS) as IssueRelationType[]).map((t) => (
            <option key={t} value={t}>{RELATION_LABELS[t]}</option>
          ))}
        </select>
        <select
          value={targetId ?? ""}
          onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : undefined)}
          className={cn(selectClass, "flex-1 min-w-0")}
        >
          <option value="">Choisir une issue…</option>
          {candidates.map((i) => (
            <option key={i.id} value={i.id}>{i.identifier} — {i.title}</option>
          ))}
        </select>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={add} disabled={!targetId || adding}>
          <Plus className="size-3.5" /> Lier
        </Button>
      </div>
    </div>
  )
}

interface IssueSheetProps {
  issue: SheetIssue | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Slug du workspace — requis pour les pièces jointes */
  workspaceSlug?: string
  /** ID numérique du projet — requis pour les pièces jointes */
  projectId?: number
}

export function IssueSheet({ issue, open, onOpenChange, workspaceSlug, projectId }: Readonly<IssueSheetProps>) {
  const router = useRouter()
  const { fetchComments, addComment, deleteComment, fetchActivity, updateIssue, deleteIssue, fetchStatuses,
          comments: storeComments, activity: storeActivity, statuses: storeStatuses } = useIssueStore()
  const { labelsByProject, fetchLabels } = useLabelStore()

  const initDescription = issue?.description ?? ""
  const [comment, setComment] = useState("")
  const [tab, setTab] = useState<"comments" | "activity" | "attachments" | "github" | "subtasks" | "relations" | "checklist">("comments")

  // Status (real IDs from API)
  const [statusId, setStatusId]             = useState<number>(issue?.statusId ?? 0)
  const [statusName, setStatusName]         = useState<string>(issue?.statusName ?? "")
  const [statusCategory, setStatusCategory] = useState<IssueStatusCategory>(issue?.statusCategory ?? "BACKLOG")

  // Project members
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])

  // Loading flags
  const [loadingComments, setLoadingComments] = useState(false)
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Main content editing
  const [title, setTitle] = useState(issue?.title ?? "")
  const [editingTitle, setEditingTitle] = useState(false)
  const [description, setDescription] = useState(initDescription)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(initDescription)
  const titleRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Sidebar editable state
  const [priority, setPriority] = useState<IssuePriority>(issue?.priority ?? "NONE")
  const [assignee, setAssignee] = useState(issue?.assignee ?? null)
  const [labels, setLabels] = useState<IssueLabel[]>(issue?.labels ?? [])
  const [points, setPoints] = useState<number | null>(issue?.storyPoints ?? null)
  const [cycle, setCycle] = useState<string | null>(issue?.cycle ?? null)
  const [editingCycle, setEditingCycle] = useState(false)
  const [cycleDraft, setCycleDraft] = useState(issue?.cycle ?? "")
  const [dueDate, setDueDate] = useState<string | null>(issue?.dueDate ?? null)
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [dueDateDraft, setDueDateDraft] = useState("")
  const cycleRef  = useRef<HTMLInputElement>(null)
  const dueDateRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editingTitle)   titleRef.current?.focus() }, [editingTitle])
  useEffect(() => { if (editingDesc)    descRef.current?.focus()  }, [editingDesc])
  useEffect(() => { if (editingCycle)   cycleRef.current?.focus()  }, [editingCycle])
  useEffect(() => { if (editingDueDate) dueDateRef.current?.focus() }, [editingDueDate])

  // Reset state when issue changes
  useEffect(() => {
    if (!issue) return
    setTitle(issue.title)
    setDescription(issue.description ?? "")
    setDescDraft(issue.description ?? "")
    setPriority(issue.priority)
    setAssignee(issue.assignee ?? null)
    setLabels(issue.labels)
    setDueDate(issue.dueDate)
    setPoints(issue.storyPoints)
    setCycle(issue.cycle)
    setStatusId(issue.statusId)
    setStatusId(issue.statusId)
    setStatusName(issue.statusName)
    setStatusCategory(issue.statusCategory)
  }, [issue])

  // Load project members + statuses + labels when sheet opens
  useEffect(() => {
    if (!open || !workspaceSlug || !projectId) return
    listProjectMembers(workspaceSlug, projectId)
      .then(setProjectMembers)
      .catch(() => { /* silent */ })
    fetchStatuses(workspaceSlug, projectId)
      .catch(() => { /* silent */ })
    fetchLabels(workspaceSlug, projectId)
      .catch(() => { /* silent */ })
  }, [open, workspaceSlug, projectId, fetchStatuses, fetchLabels])

  // Load comments when tab = comments
  useEffect(() => {
    if (!open || tab !== "comments" || !workspaceSlug || !projectId || !issue) return
    setLoadingComments(true)
    fetchComments(workspaceSlug, projectId, Number(issue.id))
      .catch(() => toast.error("Could not load comments"))
      .finally(() => setLoadingComments(false))
  }, [open, tab, issue, workspaceSlug, projectId, fetchComments])

  // Load activity when tab = activity
  useEffect(() => {
    if (!open || tab !== "activity" || !workspaceSlug || !projectId || !issue) return
    setLoadingActivity(true)
    fetchActivity(workspaceSlug, projectId, Number(issue.id))
      .catch(() => toast.error("Could not load activity"))
      .finally(() => setLoadingActivity(false))
  }, [open, tab, issue, workspaceSlug, projectId, fetchActivity])

  if (!issue) return null

  const statusCfg   = getStatusCfg(statusCategory)
  const priorityCfg = PRIORITY_CONFIG[priority]
  const isOverdue   = dueDate === "Overdue"
  const noAssignee  = assignee === null
  const issueId     = Number(issue.id)

  // Use real statuses from store if loaded, fallback to category-based config
  const displayStatuses: ApiIssueStatus[] = storeStatuses
  // Couleur réelle de la colonne courante (reflète la couleur personnalisée du board)
  const currentStatusColor = displayStatuses.find((s) => s.id === statusId)?.color ?? "#94a3b8"

  async function callUpdate(payload: Parameters<typeof updateIssue>[3]) {
    if (!workspaceSlug || !projectId) return
    try {
      await updateIssue(workspaceSlug, projectId, issueId, payload)
    } catch {
      toast.error("Failed to save")
    }
  }

  function saveCycle() {
    setCycle(cycleDraft.trim() || null)
    setEditingCycle(false)
    toast.success("Cycle updated")
  }

  async function handleDelete() {
    if (!workspaceSlug || !projectId) return
    try {
      await deleteIssue(workspaceSlug, projectId, issueId)
      toast.success("Issue supprimée")
      onOpenChange(false)
    } catch {
      toast.error("Échec de la suppression")
    }
  }

  async function saveDueDate() {
    const val = dueDateDraft || null
    setDueDate(val)
    setEditingDueDate(false)
    await callUpdate({ dueDate: val })
    toast.success("Due date updated")
  }

  const onCycleKey   = makeKeyHandler(saveCycle,   () => setEditingCycle(false))
  const onDueDateKey = makeKeyHandler(saveDueDate, () => setEditingDueDate(false))

  function toggleLabel(l: IssueLabel) {
    setLabels((prev) => {
      const exists = prev.some((x) => x.id === l.id)
      const next = exists ? prev.filter((x) => x.id !== l.id) : [...prev, l]
      void callUpdate({ labelIds: next.map((x) => x.id) })
      return next
    })
  }

  function onCycleClick()  { setCycleDraft(cycle ?? ""); setEditingCycle(true) }
  function onDueDateClick() { setDueDateDraft(formatDueDateDraft(dueDate)); setEditingDueDate(true) }

  async function handleSendComment() {
    if (!comment.trim() || !workspaceSlug || !projectId) return
    const content = comment.trim()
    setComment("")
    try {
      await addComment(workspaceSlug, projectId, issueId, content)
      toast.success("Comment added")
    } catch {
      toast.error("Failed to add comment")
      setComment(content)
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!workspaceSlug || !projectId) return
    try {
      await deleteComment(workspaceSlug, projectId, issueId, commentId)
      toast.success("Comment deleted")
    } catch {
      toast.error("Failed to delete comment")
    }
  }

  async function onTitleBlur() {
    setEditingTitle(false)
    await callUpdate({ title })
    toast.success("Title updated")
  }
  async function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { setEditingTitle(false); await callUpdate({ title }); toast.success("Title updated") }
    if (e.key === "Escape") { setTitle(issue!.title); setEditingTitle(false) }
  }

  function onDescKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setDescDraft(description); setEditingDesc(false) }
  }
  async function saveDescription() {
    setDescription(descDraft)
    setEditingDesc(false)
    await callUpdate({ description: descDraft })
    toast.success("Description updated")
  }
  function cancelDescription() { setDescDraft(description); setEditingDesc(false) }

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
              <button type="button" className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: currentStatusColor }} />
                <span>{statusName || statusCfg.label}</span>
                <ChevronDown className="size-3 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {displayStatuses.length > 0 ? displayStatuses.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    className="flex items-center gap-2 text-xs"
                    onClick={async () => {
                      setStatusId(s.id)
                      setStatusName(s.name)
                      setStatusCategory(s.category)
                      await callUpdate({ statusId: s.id })
                      toast.success(`Status → ${s.name}`)
                    }}
                  >
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}
                    {statusId === s.id && <CheckIcon className="ml-auto size-3 text-primary" />}
                  </DropdownMenuItem>
              )) : (Object.keys(STATUS_CATEGORY_CONFIG) as IssueStatusCategory[]).map((cat) => (
                <DropdownMenuItem
                  key={cat}
                  className={cn("flex items-center gap-2 text-xs", STATUS_CATEGORY_CONFIG[cat].color)}
                  onClick={() => {
                    setStatusCategory(cat)
                    setStatusName(STATUS_CATEGORY_CONFIG[cat].label)
                    toast.success(`Status → ${STATUS_CATEGORY_CONFIG[cat].label}`)
                  }}
                >
                  {STATUS_CATEGORY_CONFIG[cat].icon}
                  {STATUS_CATEGORY_CONFIG[cat].label}
                  {statusCategory === cat && <CheckIcon className="ml-auto size-3 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (workspaceSlug && projectId) {
                router.push(`/${workspaceSlug}/projects/${projectId}/issues/${issue.id}`)
                onOpenChange(false)
              }
            }}
            title="Ouvrir l'issue en page pleine"
          >
            <ExternalLink className="size-3.5" />
            Open
          </Button>
          <DeleteConfirmDialog
            title="Supprimer l'issue ?"
            description={`« ${issue.title} » sera définitivement supprimée. Cette action est irréversible.`}
            confirmLabel="Supprimer"
            onConfirm={handleDelete}
          >
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Supprimer l'issue">
              <Trash2 className="size-4" />
            </Button>
          </DeleteConfirmDialog>
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
                onBlur={onTitleBlur}
                onKeyDown={onTitleKeyDown}
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
                    onKeyDown={onDescKeyDown}
                    rows={5}
                    className="w-full rounded-md border border-primary/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/20 resize-none transition-all"
                    placeholder="Add a description…"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveDescription}>
                      <CheckIcon className="size-3" />Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelDescription}>
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

            {/* Comments / Activity / Attachments tabs */}
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
                  Comments ({storeComments.length})
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
                {workspaceSlug && projectId && (
                  <button
                    type="button"
                    onClick={() => setTab("attachments")}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                      tab === "attachments"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Paperclip className="size-3.5" />
                    Attachments
                  </button>
                )}
                {workspaceSlug && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("github")
                      if (workspaceSlug && issue?.id) {
                        useIntegrationStore.getState().fetchGitHubLinks(workspaceSlug, Number(issue.id)).catch(() => null)
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                      tab === "github"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <GitBranch className="size-3.5" />
                    GitHub
                  </button>
                )}
                {workspaceSlug && projectId && (
                  <button
                    type="button"
                    onClick={() => setTab("subtasks")}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                      tab === "subtasks"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Layers className="size-3.5" />
                    Sub-tasks
                  </button>
                )}
                {workspaceSlug && projectId && (
                  <button
                    type="button"
                    onClick={() => setTab("relations")}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                      tab === "relations"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Link2 className="size-3.5" />
                    Relations
                  </button>
                )}
                {workspaceSlug && projectId && (
                  <button
                    type="button"
                    onClick={() => setTab("checklist")}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium pb-2.5 border-b-2 -mb-px transition-colors",
                      tab === "checklist"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Checklist
                  </button>
                )}
              </div>

              {tab === "comments" && (
                <CommentsTab
                  comments={storeComments}
                  loading={loadingComments}
                  comment={comment}
                  onChange={setComment}
                  onSend={handleSendComment}
                  onDelete={handleDeleteComment}
                />
              )}

              {tab === "activity" && (
                <div className="flex flex-col gap-0">
                  {loadingActivity && (
                    <p className="text-xs text-muted-foreground text-center py-4">Loading activity…</p>
                  )}
                  {!loadingActivity && storeActivity.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4 italic">No activity yet.</p>
                  )}
                  {storeActivity.map((a, i) => (
                    <div key={a.id} className="flex items-start gap-3 py-2.5 relative">
                      {i < storeActivity.length - 1 && (
                        <div className="absolute left-2 top-7 bottom-0 w-px bg-border" />
                      )}
                      <div className="size-4 mt-0.5 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center">
                        <div className="size-1.5 rounded-full bg-muted-foreground/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground">
                          {a.actor ? (a.actor.displayName ?? a.actor.email) : "System"}
                          {" "}
                          <span className="font-medium text-foreground">{a.action.replaceAll("_", " ").toLowerCase()}</span>
                          {a.oldValue && a.newValue && (
                            <span> from <span className="text-muted-foreground">{a.oldValue}</span> to <span className="text-foreground">{a.newValue}</span></span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground/60 ml-2">{formatActivityTime(a.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "attachments" && workspaceSlug && projectId && (
                <AttachmentsTab
                  issueId={Number(issue.id)}
                  projectId={projectId}
                  workspaceSlug={workspaceSlug}
                />
              )}

              {tab === "github" && workspaceSlug && (
                <GitHubTab issueId={Number(issue.id)} workspaceSlug={workspaceSlug} />
              )}

              {tab === "subtasks" && workspaceSlug && projectId && (
                <SubtasksTab
                  issueId={Number(issue.id)}
                  projectId={projectId}
                  workspaceSlug={workspaceSlug}
                />
              )}

              {tab === "relations" && workspaceSlug && projectId && (
                <RelationsTab
                  issueId={Number(issue.id)}
                  projectId={projectId}
                  workspaceSlug={workspaceSlug}
                />
              )}

              {tab === "checklist" && workspaceSlug && projectId && (
                <ChecklistTab
                  issueId={Number(issue.id)}
                  projectId={projectId}
                  workspaceSlug={workspaceSlug}
                />
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
                    <DropdownMenuItem key={p} className="flex items-center gap-2 text-xs" onClick={async () => {
                      setPriority(p)
                      await callUpdate({ priority: p })
                      toast.success(`Priority → ${PRIORITY_CONFIG[p].label}`)
                    }}>
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
                        <UserAvatar
                          email={assignee.email}
                          name={assignee.name}
                          className="size-4 shrink-0"
                          fallbackClassName="text-[8px]"
                        />
                        <span className="text-xs flex-1 truncate">{assignee.name}</span>
                      </>
                    ) : (
                      <span className="text-xs flex-1 text-muted-foreground">Unassigned</span>
                    )}
                    <ChevronDown className="size-3 opacity-40 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem className="flex items-center gap-2 text-xs" onClick={async () => {
                    setAssignee(null)
                    await callUpdate({ assigneeId: null })
                    toast.success("Unassigned")
                  }}>
                    <span className="size-4 inline-block shrink-0" />
                    <span className="text-muted-foreground">No assignee</span>
                    {noAssignee && <CheckIcon className="ml-auto size-3 text-primary" />}
                  </DropdownMenuItem>
                  {projectMembers.map((m) => {
                    const initials = memberInitials(m)
                    const color    = memberColor(m.userId)
                    const name     = m.displayName ?? m.email
                    return (
                      <DropdownMenuItem key={m.userId} className="flex items-center gap-2 text-xs" onClick={async () => {
                        setAssignee({ initials, color, name, userId: m.userId, email: m.email })
                        await callUpdate({ assigneeId: m.userId })
                        toast.success(`Assigned to ${name}`)
                      }}>
                        <UserAvatar
                          email={m.email}
                          name={name}
                          avatarUrl={m.avatarUrl}
                          className="size-4 shrink-0"
                          fallbackClassName="text-[8px]"
                        />
                        {name}
                        {assignee?.userId === m.userId ? <CheckIcon className="ml-auto size-3 text-primary" /> : null}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </MetaRow>

            {/* Smart Auto-Assign */}
            {workspaceSlug && projectId && (
              <SmartAssignPanel
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueLabels={labels.map((l) => l.name)}
                issuePriority={priority}
                currentAssignee={assignee}
                defaultOpen={noAssignee}
                onAssign={async (m) => {
                  const initials = (m.displayName ?? m.email).slice(0, 2).toUpperCase()
                  const color = memberColor(m.userId)
                  const name = m.displayName ?? m.email
                  setAssignee({ initials, color, name, userId: m.userId, email: m.email })
                  await callUpdate({ assigneeId: m.userId })
                  toast.success(`Assigned to ${name}`)
                }}
              />
            )}

            {/* Labels — multi-select */}
            <MetaRow icon={<Tag className="size-3.5" />} label="Labels">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-start gap-1 hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors min-h-6">
                    <div className="flex flex-wrap gap-1 flex-1">
                      {labels.length > 0
                        ? labels.map((l) => (
                            <Badge
                              key={l.id}
                              variant="secondary"
                              className="text-[10px] px-1.5 h-4 border-0"
                              style={{ backgroundColor: `${l.color}22`, color: l.color }}
                            >
                              {l.name}
                            </Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">Add label</span>}
                    </div>
                    <ChevronDown className="size-3 opacity-40 shrink-0 mt-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  {(labelsByProject[projectId ?? 0] ?? []).length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                      No labels — create some in project settings
                    </div>
                  )}
                  {(labelsByProject[projectId ?? 0] ?? []).map((l) => {
                    const active = labels.some((x) => x.id === l.id)
                    return (
                      <DropdownMenuItem
                        key={l.id}
                        className="flex items-center gap-2 text-xs"
                        onSelect={(e) => { e.preventDefault(); toggleLabel(l) }}
                      >
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.name}
                        {active ? <CheckIcon className="ml-auto size-3 text-primary" /> : null}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </MetaRow>

            {/* Points — select de presets (estimation d'effort), persiste en base */}
            <MetaRow icon={<Layers className="size-3.5" />} label="Points">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-xs hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 w-full text-left transition-colors">
                    <span className="flex-1 text-foreground">{points === null ? "—" : `${points} pts`}</span>
                    <ChevronDown className="size-3 opacity-40 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-32">
                  {STORY_POINT_PRESETS.map((pt) => (
                    <DropdownMenuItem
                      key={pt ?? "none"}
                      className="flex items-center gap-2 text-xs"
                      onSelect={async (e) => {
                        e.preventDefault()
                        setPoints(pt)
                        // 0 = retirer l'estimation côté backend
                        await callUpdate({ storyPoints: pt ?? 0 })
                        toast.success("Points updated")
                      }}
                    >
                      {pt === null ? "Aucune estimation" : `${pt} pts`}
                      {points === pt ? <CheckIcon className="ml-auto size-3 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
