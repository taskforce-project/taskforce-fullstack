"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  X, RefreshCw, Clock, CheckCircle2, AlertTriangle, CircleDot,
  Flag, Tag, Calendar, Layers, GitBranch, Activity,
  ChevronDown, ChevronRight, Send, ExternalLink, Pencil, Check as CheckIcon,
  Paperclip, Upload, Trash2, FileText, Link2, Plus,
  MoreHorizontal, Pin, PinOff, Archive, ArchiveRestore, Link as LinkIcon, Hash,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api/client"
import {
  Sheet, SheetContent, SheetClose, SheetTitle,
} from "@/components/ui/sheet"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { SmartAssignPanel } from "@/components/smart-assign/smart-assign-panel"
import { IssueAiSpecPanel } from "@/components/issues/issue-ai-spec"
import { IssueDescription } from "@/components/issues/issue-description"
import { BrandLogo } from "@/components/ui/brand-logo"
import { DatePicker } from "@/components/ui/date-picker"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  formatFileSize,
  type Attachment,
} from "@/lib/api/attachment-service"
import { useIssueStore } from "@/lib/store/issue-store"
import { useUserStore } from "@/lib/store/user-store"
import { useLabelStore } from "@/lib/store/label-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-service"
import { listCycles, addIssueToCycle, removeIssueFromCycle, listIssueCycles, type Cycle } from "@/lib/api/cycle-service"
import type { IssueComment, IssueActivity, IssueLabel, IssueStatus as ApiIssueStatus, Issue, IssueRelation, IssueRelationType, ChecklistItem, Worklog } from "@/lib/api/issue-service"
import { listChildIssues, listRelations, addRelation, deleteRelation,
         listChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem,
         listWorklogs, addWorklog, deleteWorklog } from "@/lib/api/issue-service"

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
  assignee: { initials: string; color: string; name: string; userId: number; email?: string | null; avatarUrl?: string | null } | null
  assigneeId: number | null
  labels: IssueLabel[]
  dueDate: string | null
  storyPoints: number | null
  createdAt: string
  description?: string
  pinned?: boolean
  archived?: boolean
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
function formatCommentTime(iso: string): string {
  try {
    // Le backend renvoie un LocalDateTime UTC sans offset ("...T12:00:00") : sans "Z",
    // new Date() le parse en heure locale et un commentaire récent reste bloqué sur
    // "just now" (diff ≤ 0). On force UTC si aucun fuseau n'est présent. Cf. ISS-09.
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z")
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
  // Ligne de propriété inline façon Linear : libellé à gauche (icône + texte), valeur à droite.
  // Plus compact et scannable que le libellé au-dessus ; la sidebar (288px) tient largement une
  // colonne libellé (~88px) + un contrôle shadcn à droite. `items-center` + min-h-8 alignent le
  // libellé sur les contrôles h-8 ; une valeur multi-ligne (labels, échéance en retard) reste lisible.
  return (
    <div className="flex items-center gap-3 min-h-9 py-1.5">
      <div className="flex w-[92px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections empilées (remplacent la bande d'onglets scrollable - façon Linear/GitHub)
// ---------------------------------------------------------------------------

function SectionHeading({ icon, title, count }: Readonly<{ icon: React.ReactNode; title: string; count?: number }>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {typeof count === "number" && count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{count}</span>
      )}
    </div>
  )
}

/** Section toujours ouverte (sous-tâches, checklist, pièces jointes…). */
function Section({ icon, title, count, children }: Readonly<{ icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }>) {
  return (
    <section>
      <div className="mb-2"><SectionHeading icon={icon} title={title} count={count} /></div>
      {children}
    </section>
  )
}

/** Section repliable (Spec IA, relations, GitHub) - le contenu n'est monté qu'à l'ouverture. */
function CollapsibleSection({
  icon, title, count, defaultOpen = false, children,
}: Readonly<{ icon: React.ReactNode; title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }>) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md py-1 text-left transition-colors hover:text-foreground">
        <SectionHeading icon={icon} title={title} count={count} />
        <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      {/* -mx-1 px-1 + pb-1 : réserve interne pour que le focus-ring des inputs ne soit pas rogné
          par l'overflow-hidden du CollapsibleContent (animation Radix), sans décaler le contenu. */}
      <CollapsibleContent className="-mx-1 px-1 pt-3 pb-1">{children}</CollapsibleContent>
    </Collapsible>
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
      toast.success("GitHub link added")
      setShowForm(false)
      setRepoFullName(""); setPrNumber(""); setPrUrl(""); setCommitSha(""); setCommitUrl(""); setLinkTitle("")
    } catch {
      toast.error("Could not add link")
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
                try { await removeGitHubLink(workspaceSlug, issueId, link.id); toast.success("Link deleted") }
                catch { toast.error("Could not delete link") }
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
          <Input
            className="h-8 w-full text-xs"
            placeholder="owner/repo"
            value={repoFullName}
            onChange={(e) => setRepoFullName(e.target.value)}
          />
          {linkType === "PR" && (
            <>
              <Input
                className="h-8 w-full text-xs"
                placeholder="PR number"
                type="number"
                value={prNumber}
                onChange={(e) => setPrNumber(e.target.value)}
              />
              <Input
                className="h-8 w-full text-xs"
                placeholder="PR URL (optional)"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
              />
            </>
          )}
          {linkType === "COMMIT" && (
            <>
              <Input
                className="h-8 w-full text-xs"
                placeholder="Commit SHA"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
              />
              <Input
                className="h-8 w-full text-xs"
                placeholder="Commit URL (optional)"
                value={commitUrl}
                onChange={(e) => setCommitUrl(e.target.value)}
              />
            </>
          )}
          <Input
            className="h-8 w-full text-xs"
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

interface ActivityFeedProps {
  comments: IssueComment[]
  activity: IssueActivity[]
  loading: boolean
  comment: string
  onChange: (v: string) => void
  onSend: () => void
  onDelete: (id: number) => void
}

type FeedEntry =
  | { kind: "comment"; at: string; data: IssueComment }
  | { kind: "event";   at: string; data: IssueActivity }

/** Pagination du fil : nb d'entrées visibles au départ, puis pas du « charger plus ». */
const ACTIVITY_INITIAL = 5
const ACTIVITY_STEP = 10

/**
 * Fil d'activité unifié (commentaires + évènements) : le plus récent EN HAUT, zone de saisie
 * en tête (le commentaire posté apparaît juste en dessous) et bouton « charger plus » pour
 * dérouler les entrées plus anciennes. Façon GitHub/Linear.
 */
function ActivityFeed({ comments, activity, loading, comment, onChange, onSend, onDelete }: Readonly<ActivityFeedProps>) {
  const currentUser = useUserStore((s) => s.user)
  // Combien d'entrées afficher (pagination « charger plus ») - départ court pour garder l'issue lisible.
  const [visible, setVisible] = useState(ACTIVITY_INITIAL)
  const entries: FeedEntry[] = [
    ...comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, data: c })),
    ...activity.map((a) => ({ kind: "event"   as const, at: a.createdAt, data: a })),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()) // plus récent d'abord
  const shown = entries.slice(0, visible)
  const remaining = entries.length - shown.length

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Zone de saisie - en tête : le commentaire posté apparaît juste en dessous (plus récent d'abord). */}
      <div className="flex gap-3">
        <UserAvatar email={currentUser?.email} name={currentUser?.displayName ?? currentUser?.email} avatarUrl={currentUser?.avatarUrl} className="size-7 shrink-0 mt-0.5" fallbackClassName="text-[9px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Textarea
            placeholder="Add a comment…  (Ctrl+Enter to send)"
            value={comment}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-16 resize-none"
          />
          {comment.trim() && (
            <div className="flex justify-end">
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onSend}>
                <Send className="size-3" /> Comment
              </Button>
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}
      {!loading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No activity yet.</p>
      )}

      {shown.length > 0 && (
        <div className="flex flex-col gap-3">
          {shown.map((entry) => {
            if (entry.kind === "comment") {
              const c = entry.data
              const isMe = currentUser?.email === c.author.email
              return (
                <div key={`c-${c.id}`} className="flex gap-3">
                  <UserAvatar email={c.author.email} name={c.author.displayName ?? c.author.email} avatarUrl={c.author.avatarUrl} className="size-7 shrink-0 mt-0.5" fallbackClassName="text-[9px]" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{c.author.displayName ?? c.author.email}</span>
                      <span className="text-xs text-muted-foreground">{formatCommentTime(c.createdAt)}</span>
                      {c.isEdited && <span className="text-[10px] italic text-muted-foreground/60">(edited)</span>}
                      {isMe && (
                        <button type="button" onClick={() => onDelete(c.id)} title="Delete comment" className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400">
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">{c.content}</div>
                  </div>
                </div>
              )
            }
            const a = entry.data
            const actorName = a.actor ? (a.actor.displayName ?? a.actor.email) : "System"
            return (
              <div key={`e-${a.id}`} className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                  <div className="size-1.5 rounded-full bg-muted-foreground/40" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">{actorName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {a.action.replaceAll("_", " ").toLowerCase()}
                    {a.oldValue && a.newValue && <> : <span className="text-muted-foreground/80">{a.oldValue}</span> → <span className="text-foreground">{a.newValue}</span></>}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/60">{formatCommentTime(a.createdAt)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + ACTIVITY_STEP)}
          className="mx-auto flex items-center gap-1.5 rounded-md px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronDown className="size-3.5" /> Load more ({remaining})
        </button>
      )}
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

export function AttachmentsTab({ issueId, projectId, workspaceSlug }: Readonly<AttachmentsTabProps>) {
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
              {a.contentType?.startsWith("image/") && a.downloadUrl ? (
                // Aperçu inline pour les images (vignette cliquable → plein écran).
                // <img> natif volontaire : l'URL présignée MinIO (localhost:9000, signature liée à
                // l'URL exacte) doit être chargée par le navigateur, pas proxyfiée par next/image.
                <a href={a.downloadUrl} target="_blank" rel="noreferrer" className="shrink-0" title={a.originalName}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.downloadUrl}
                    alt={a.originalName}
                    loading="lazy"
                    className="size-9 rounded object-cover border border-border bg-muted"
                  />
                </a>
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
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

/** Presets d'estimation (story points, façon Fibonacci) ; null = aucune estimation */
const STORY_POINT_PRESETS: (number | null)[] = [null, 1, 2, 3, 5, 8, 13]


// ─── Sous-tâches (PROD-2.1) ────────────────────────────────────────────────────
export function SubtasksTab({
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
        toast.success("Subtask created")
      } else {
        // createIssue avale l'erreur et renvoie null → on signale l'échec (ex. refus VIEWER).
        toast.error("Couldn't create subtask")
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>}
      {!loading && children.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No subtasks.</p>
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
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder="New subtask…"
          className="h-8 flex-1 text-xs"
        />
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={add} disabled={!title.trim() || adding}>
          <Plus className="size-3.5" /> Add
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
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setAdding(false)
    }
  }

  async function toggle(item: ChecklistItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
    try {
      await updateChecklistItem(workspaceSlug, projectId, issueId, item.id, { done: !item.done })
    } catch (e) {
      // Rollback optimiste + on explique pourquoi la coche ne tient pas.
      refresh()
      toast.error(getErrorMessage(e))
    }
  }

  async function remove(item: ChecklistItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await deleteChecklistItem(workspaceSlug, projectId, issueId, item.id)
    } catch (e) {
      refresh()
      toast.error(getErrorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{doneCount}/{items.length}</span>
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No checklist items.</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(item)}
            aria-label={item.done ? "Uncheck" : "Check"}
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
            aria-label="Delete item"
            className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder="Add an item…"
          className="h-8 flex-1 text-xs"
        />
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={add} disabled={!content.trim() || adding}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </div>
  )
}

// ─── Time tracking / worklogs (BE-ISS-012) ─────────────────────────────────────
function formatMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h > 0 && m > 0) return `${h}h${m.toString().padStart(2, "0")}`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function WorklogTab({
  issueId, projectId, workspaceSlug,
}: Readonly<{ issueId: number; projectId: number; workspaceSlug: string }>) {
  const [entries, setEntries] = useState<Worklog[]>([])
  const [loading, setLoading] = useState(false)
  const [minutes, setMinutes] = useState("")
  const [description, setDescription] = useState("")
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listWorklogs(workspaceSlug, projectId, issueId)
      .then(setEntries)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [workspaceSlug, projectId, issueId])

  useEffect(() => { refresh() }, [refresh])

  const total = entries.reduce((s, e) => s + e.minutes, 0)

  async function add() {
    const m = Number(minutes)
    if (!Number.isFinite(m) || m <= 0 || adding) return
    setAdding(true)
    try {
      const entry = await addWorklog(workspaceSlug, projectId, issueId, {
        minutes: Math.round(m),
        description: description.trim() || null,
      })
      setEntries((prev) => [entry, ...prev])
      setMinutes("")
      setDescription("")
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setAdding(false)
    }
  }

  async function remove(entry: Worklog) {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    try {
      await deleteWorklog(workspaceSlug, projectId, issueId, entry.id)
    } catch (e) {
      refresh()
      toast.error(getErrorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total logged</span>
          <span className="font-semibold text-foreground">{formatMinutes(total)}</span>
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>}
      {!loading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No time logged yet.</p>
      )}
      {entries.map((e) => (
        <div key={e.id} className="group flex items-center gap-2 border-b border-border/50 py-1.5 last:border-0">
          <UserAvatar
            email={e.user.email}
            name={e.user.displayName ?? e.user.email}
            avatarUrl={e.user.avatarUrl}
            className="size-5"
            fallbackClassName="text-[8px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-foreground">{formatMinutes(e.minutes)}</span>
              <span className="text-[10px] text-muted-foreground">· {e.loggedAt}</span>
            </div>
            {e.description && <p className="truncate text-[11px] text-muted-foreground">{e.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => remove(e)}
            aria-label="Delete entry"
            className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="Min."
          className="h-8 w-16 text-xs"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder="Description (optional)"
          className="h-8 min-w-0 flex-1 text-xs"
        />
        <Button size="sm" className="h-8 shrink-0 gap-1 text-xs" onClick={add} disabled={!minutes || adding}>
          <Plus className="size-3.5" /> Log
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
      toast.success("Relation added")
    } catch (e) {
      // Les 4xx (ex. relation en double / circulaire) ne sont PAS toastés globalement → on le fait ici.
      toast.error(getErrorMessage(e))
    } finally {
      setAdding(false)
    }
  }

  async function remove(relationId: number) {
    try {
      await deleteRelation(workspaceSlug, projectId, issueId, relationId)
      refresh()
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>}
      {!loading && relations.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No relations.</p>
      )}
      {relations.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
          <Badge variant="outline" className="text-[9px] shrink-0">{RELATION_LABELS[r.relationType]}</Badge>
          <span className="w-16 shrink-0 truncate font-mono text-[10px] text-muted-foreground">{r.relatedIssue.identifier}</span>
          <span className="flex-1 truncate text-xs text-foreground">{r.relatedIssue.title}</span>
          <button
            type="button"
            onClick={() => remove(r.id)}
            aria-label="Delete relation"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}

      <div className="mt-1 flex items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v as IssueRelationType)}>
          <SelectTrigger size="sm" className="w-[132px] shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RELATION_LABELS) as IssueRelationType[]).map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{RELATION_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={targetId ? String(targetId) : ""}
          onValueChange={(v) => setTargetId(v ? Number(v) : undefined)}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
            <SelectValue placeholder="Choose an issue…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((i) => (
              <SelectItem key={i.id} value={String(i.id)} className="text-xs">
                <span className="font-mono text-muted-foreground">{i.identifier}</span> - {i.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 shrink-0 gap-1 text-xs" onClick={add} disabled={!targetId || adding}>
          <Plus className="size-3.5" /> Link
        </Button>
      </div>
    </div>
  )
}

interface IssueSheetProps {
  issue: SheetIssue | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Slug du workspace - requis pour les pièces jointes */
  workspaceSlug?: string
  /** ID numérique du projet - requis pour les pièces jointes */
  projectId?: number
}

export function IssueSheet({ issue, open, onOpenChange, workspaceSlug, projectId }: Readonly<IssueSheetProps>) {
  const { fetchComments, addComment, deleteComment, fetchActivity, updateIssue, deleteIssue,
          archiveIssue, pinIssue, fetchStatuses, fetchIssue,
          comments: storeComments, activity: storeActivity, statuses: storeStatuses } = useIssueStore()
  const { labelsByProject, fetchLabels } = useLabelStore()
  const { githubLinks, githubStatus, fetchGitHubLinks } = useIntegrationStore()

  const initDescription = issue?.description ?? ""
  const [comment, setComment] = useState("")

  // Archive / pin (façon GitHub)
  const [pinned, setPinned] = useState<boolean>(issue?.pinned ?? false)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
  const titleRef = useRef<HTMLInputElement>(null)

  // Sidebar editable state
  const [priority, setPriority] = useState<IssuePriority>(issue?.priority ?? "NONE")
  const [assignee, setAssignee] = useState(issue?.assignee ?? null)
  const [labels, setLabels] = useState<IssueLabel[]>(issue?.labels ?? [])
  const [points, setPoints] = useState<number | null>(issue?.storyPoints ?? null)
  const [dueDate, setDueDate] = useState<string | null>(issue?.dueDate ?? null)
  // Smart Assign : déclenché par l'étoile IA dans la ligne Assignee (pas un bloc pleine largeur).
  // `smartRun` = jeton incrémenté au clic pour relancer l'analyse ; l'ouverture par défaut n'analyse pas.
  const [smartOpen, setSmartOpen] = useState(false)
  const [smartRun, setSmartRun] = useState(0)
  // Cycle courant de l'issue + cycles du projet (options du sélecteur) - CYC-03b.
  const [cycleId, setCycleId] = useState<number | null>(null)
  const [projectCycles, setProjectCycles] = useState<Cycle[]>([])
  // Compteurs des sections repliées (badges façon Linear) - chargés à l'ouverture, visibles repliés.
  const [sectionCounts, setSectionCounts] = useState({ checklist: 0, attachments: 0, relations: 0 })

  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  // Reset state when issue changes
  useEffect(() => {
    if (!issue) return
    setTitle(issue.title)
    setDescription(issue.description ?? "")
    setPriority(issue.priority)
    setAssignee(issue.assignee ?? null)
    setLabels(issue.labels)
    setDueDate(issue.dueDate)
    setPoints(issue.storyPoints)
    setStatusId(issue.statusId)
    setStatusName(issue.statusName)
    setStatusCategory(issue.statusCategory)
    setPinned(issue.pinned ?? false)
    setCycleId(null)
    setSmartOpen(false)   // ne pas laisser le panneau Smart Assign ouvert d'une issue à l'autre
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

  // Cycles du projet (options du sélecteur) + cycle courant de l'issue - CYC-03b.
  useEffect(() => {
    if (!open || !workspaceSlug || !projectId || !issue) return
    listCycles(workspaceSlug, projectId).then(setProjectCycles).catch(() => { /* silent */ })
    listIssueCycles(workspaceSlug, projectId, Number(issue.id))
      .then((cs) => setCycleId(cs[0]?.id ?? null))
      .catch(() => { /* silent */ })
  }, [open, workspaceSlug, projectId, issue])

  // Fil d'activité unifié → charger commentaires + évènements dès l'ouverture du sheet.
  useEffect(() => {
    if (!open || !workspaceSlug || !projectId || !issue) return
    const id = Number(issue.id)
    setLoadingComments(true)
    fetchComments(workspaceSlug, projectId, id)
      .catch(() => toast.error("Could not load comments"))
      .finally(() => setLoadingComments(false))
    setLoadingActivity(true)
    fetchActivity(workspaceSlug, projectId, id)
      .catch(() => null)
      .finally(() => setLoadingActivity(false))
  }, [open, issue, workspaceSlug, projectId, fetchComments, fetchActivity])

  // Compteurs des sections repliées - on charge juste les longueurs à l'ouverture pour afficher un
  // badge « n » (façon Linear) sans avoir à déplier. Les onglets rechargent leur détail à l'ouverture.
  useEffect(() => {
    if (!open || !workspaceSlug || !projectId || !issue) return
    const id = Number(issue.id)
    const put = (key: "checklist" | "attachments" | "relations", n: number) =>
      setSectionCounts((c) => (c[key] === n ? c : { ...c, [key]: n }))
    listChecklist(workspaceSlug, projectId, id).then((a) => put("checklist", a.length)).catch(() => { /* silent */ })
    listRelations(workspaceSlug, projectId, id).then((a) => put("relations", a.length)).catch(() => { /* silent */ })
    listAttachments(workspaceSlug, projectId, id).then((a) => put("attachments", a.length)).catch(() => { /* silent */ })
    if (githubStatus?.connected) fetchGitHubLinks(workspaceSlug, id).catch(() => { /* silent */ })
  }, [open, workspaceSlug, projectId, issue, githubStatus?.connected, fetchGitHubLinks])

  if (!issue) return null

  const statusCfg   = getStatusCfg(statusCategory)
  const priorityCfg = PRIORITY_CONFIG[priority]
  const dueIso      = dueDate && /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : ""
  const isOverdue   = dueDate === "Overdue" || (dueIso !== "" && dueIso < new Date().toISOString().slice(0, 10))
  const noAssignee  = assignee === null
  const issueId     = Number(issue.id)

  // Use real statuses from store if loaded, fallback to category-based config
  const displayStatuses: ApiIssueStatus[] = storeStatuses
  // Couleur réelle de la colonne courante (reflète la couleur personnalisée du board)
  const currentStatusColor = displayStatuses.find((s) => s.id === statusId)?.color ?? "#94a3b8"

  async function callUpdate(payload: Parameters<typeof updateIssue>[3]): Promise<boolean> {
    if (!workspaceSlug || !projectId) return false
    // updateIssue avale les erreurs et renvoie null (cf. WS-10) → on remonte le refus par un toast
    // au bon moment (à l'action) plutôt que via la bannière du board révélée à la fermeture du sheet.
    const ok = await updateIssue(workspaceSlug, projectId, issueId, payload)
    if (!ok) toast.error("Change not saved - try again in a moment.")
    return Boolean(ok)
  }


  async function handleDelete() {
    if (!workspaceSlug || !projectId) return
    // deleteIssue avale l'erreur et renvoie un booléen : on distingue succès/échec sur ce retour.
    // (L'ancien try/catch ne se déclenchait jamais → « Issue deleted » s'affichait même en cas d'échec.)
    const ok = await deleteIssue(workspaceSlug, projectId, issueId)
    if (!ok) {
      toast.error("Delete failed")
      return
    }
    toast.success("Issue deleted")
    onOpenChange(false)
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error("Could not copy")
    }
  }

  async function handleTogglePin() {
    if (!workspaceSlug || !projectId) return
    const next = !pinned
    setPinned(next)
    const res = await pinIssue(workspaceSlug, projectId, issueId, next)
    if (res) toast.success(next ? "Issue pinned" : "Issue unpinned")
    else setPinned(!next)
  }

  async function handleArchive() {
    if (!workspaceSlug || !projectId) return
    const res = await archiveIssue(workspaceSlug, projectId, issueId, !(issue!.archived ?? false))
    if (res) {
      toast.success(res.archived ? "Issue archived" : "Issue unarchived")
      if (res.archived) onOpenChange(false)
    } else {
      toast.error("Archive failed")
    }
  }

  async function saveDueDate(val: string) {
    const next = val || null
    setDueDate(next)
    await callUpdate({ dueDate: next })
    toast.success(next ? "Due date updated" : "Due date removed")
  }

  function toggleLabel(l: IssueLabel) {
    const exists = labels.some((x) => x.id === l.id)
    const next = exists ? labels.filter((x) => x.id !== l.id) : [...labels, l]
    const previous = labels
    setLabels(next)
    // Si l'enregistrement échoue, on RÉTABLIT l'état précédent - pas de label « fantôme » affiché
    // comme ajouté alors qu'il n'a pas été persisté (ISS-06).
    void callUpdate({ labelIds: next.map((x) => x.id) }).then((ok) => { if (!ok) setLabels(previous) })
  }


  // L'IA a rempli l'issue (spec → description, labels, effort, priorité) → resynchroniser la vue.
  async function handleAiApplied() {
    if (!workspaceSlug || !projectId || !issue?.id) return
    try {
      const u = await fetchIssue(workspaceSlug, projectId, Number(issue.id))
      if (!u) return
      setDescription(u.description ?? "")
      if (u.priority) setPriority(u.priority)
      setPoints(u.storyPoints ?? null)
      setLabels(u.labels ?? [])
      // NB : l'assigné (auto-assign) est persisté et reflété sur le board / à la réouverture
      // (forme locale différente de l'API → pas de re-map live ici).
    } catch { /* non bloquant */ }
  }

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

  async function saveDescriptionValue(next: string) {
    setDescription(next)
    await callUpdate({ description: next })
    toast.success("Description updated")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-4xl flex flex-col p-0 gap-0"
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

          {pinned && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              <Pin className="size-3" /> Pinned
            </span>
          )}

          <div className="flex-1" />

          {/* Menu d'actions façon GitHub */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {/* Le lien partagé rouvre le board avec la sheet (`?issue=`), pas la page isolée. */}
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => copyToClipboard(`${window.location.origin}/${workspaceSlug}/projects/${projectId}?issue=${issue.id}`, "Link copied")}>
                <LinkIcon className="size-3.5" /> Copy link
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => copyToClipboard(issue.identifier, "ID copied")}>
                <Hash className="size-3.5" /> {`Copy ID (${issue.identifier})`}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-xs" onClick={handleTogglePin}>
                {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs" onClick={handleArchive}>
                {issue.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                {issue.archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-xs text-destructive focus:text-destructive"
                onSelect={(e) => { e.preventDefault(); setDeleteOpen(true) }}
              >
                <Trash2 className="size-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DeleteConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete issue?"
            description={`"${issue.title}" will be permanently deleted. This action cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={handleDelete}
          />

          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </Button>
          </SheetClose>
        </div>

        {/* ── Main body: deux colonnes en desktop, empilées + scroll unique en mobile (QA2-15) ── */}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">

          {/* Left: title + description + comments (scrollable) */}
          <div className="flex-1 min-w-0 px-6 py-5 flex flex-col gap-5 sm:overflow-y-auto">
            {/* Title - inline editable */}
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

            {/* Description - rendu markdown interactif (cases à cocher) + petit éditeur */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
              <IssueDescription value={description} onSave={saveDescriptionValue} />
            </div>

            {/* Spec IA - repliable (feature phare : spec + prompt + découpage) */}
            {workspaceSlug && projectId && issue?.id && (
              <CollapsibleSection icon={<Sparkles className="size-4" />} title="AI Spec">
                <IssueAiSpecPanel
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={Number(issue.id)}
                  onApplied={handleAiApplied}
                />
              </CollapsibleSection>
            )}

            <Separator />

            {/* Sous-tâches - section dédiée, sous la description (façon Asana/Linear) */}
            {workspaceSlug && projectId && (
              <Section icon={<Layers className="size-4" />} title="Subtasks">
                <SubtasksTab issueId={issueId} projectId={projectId} workspaceSlug={workspaceSlug} />
              </Section>
            )}

            {/* Checklist - repliable (secondaire ; le contenu ne se charge qu'à l'ouverture) */}
            {workspaceSlug && projectId && (
              <CollapsibleSection icon={<CheckCircle2 className="size-4" />} title="Checklist" count={sectionCounts.checklist}>
                <ChecklistTab issueId={issueId} projectId={projectId} workspaceSlug={workspaceSlug} />
              </CollapsibleSection>
            )}

            {/* Pièces jointes - repliable (secondaire) */}
            {workspaceSlug && projectId && (
              <CollapsibleSection icon={<Paperclip className="size-4" />} title="Attachments" count={sectionCounts.attachments}>
                <AttachmentsTab issueId={issueId} projectId={projectId} workspaceSlug={workspaceSlug} />
              </CollapsibleSection>
            )}

            {/* Relations - repliable */}
            {workspaceSlug && projectId && (
              <CollapsibleSection icon={<Link2 className="size-4" />} title="Relations" count={sectionCounts.relations}>
                <RelationsTab issueId={issueId} projectId={projectId} workspaceSlug={workspaceSlug} />
              </CollapsibleSection>
            )}

            {/* GitHub - repliable (le contenu ne se charge qu'à l'ouverture) */}
            {workspaceSlug && (
              <CollapsibleSection icon={<BrandLogo slug="github" name="GitHub" className="size-4" />} title="GitHub" count={githubLinks[issueId]?.length ?? 0}>
                <GitHubTab issueId={issueId} workspaceSlug={workspaceSlug} />
              </CollapsibleSection>
            )}

            <Separator />

            {/* Activité + commentaires - fil unifié tout en bas */}
            <Section icon={<Activity className="size-4" />} title="Activity" count={storeComments.length}>
              <ActivityFeed
                comments={storeComments}
                activity={storeActivity}
                loading={loadingComments || loadingActivity}
                comment={comment}
                onChange={setComment}
                onSend={handleSendComment}
                onDelete={handleDeleteComment}
              />
            </Section>
          </div>

          {/* Right: metadata sidebar (fully editable) - empilée sous le contenu en mobile */}
          <div className="w-full shrink-0 border-t border-border px-5 py-5 sm:w-96 sm:border-t-0 sm:border-l sm:overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Details</p>

            {/* Priority */}
            <MetaRow icon={<Flag className="size-3.5" />} label="Priority">
              <Select
                value={priority}
                onValueChange={async (p) => {
                  setPriority(p as IssuePriority)
                  await callUpdate({ priority: p as IssuePriority })
                  toast.success(`Priority → ${PRIORITY_CONFIG[p as IssuePriority].label}`)
                }}
              >
                <SelectTrigger size="sm" className="w-full">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full shrink-0", priorityCfg.dot)} />
                    {priorityCfg.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_CONFIG) as IssuePriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className={cn("size-2 rounded-full shrink-0", PRIORITY_CONFIG[p].dot)} />
                      {PRIORITY_CONFIG[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaRow>

            {/* Assignee - Select + étoile Smart Assign IA inline (taille input, pas un bloc pleine largeur) */}
            <MetaRow icon={<Avatar className="size-3.5"><AvatarFallback className="text-[7px]">?</AvatarFallback></Avatar>} label="Assignee">
              <div className="flex w-full items-center gap-1.5">
                <Select
                  value={assignee ? String(assignee.userId) : "none"}
                  onValueChange={async (val) => {
                    if (val === "none") {
                      setAssignee(null)
                      await callUpdate({ assigneeId: null })
                      toast.success("Unassigned")
                      return
                    }
                    const m = projectMembers.find((x) => String(x.userId) === val)
                    if (!m) return
                    const name = m.displayName ?? m.email
                    setAssignee({ initials: memberInitials(m), color: memberColor(m.userId), name, userId: m.userId, email: m.email, avatarUrl: m.avatarUrl })
                    await callUpdate({ assigneeId: m.userId })
                    toast.success(`Assigned to ${name}`)
                  }}
                >
                  <SelectTrigger size="sm" className="w-full min-w-0 flex-1">
                    {assignee ? (
                      <span className="flex items-center gap-1.5 min-w-0">
                        <UserAvatar email={assignee.email} name={assignee.name} avatarUrl={assignee.avatarUrl} className="size-4 shrink-0" fallbackClassName="text-[8px]" />
                        <span className="truncate">{assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><span className="text-muted-foreground">No assignee</span></SelectItem>
                    {projectMembers.map((m) => {
                      const name = m.displayName ?? m.email
                      return (
                        <SelectItem key={m.userId} value={String(m.userId)}>
                          <UserAvatar email={m.email} name={name} avatarUrl={m.avatarUrl} className="size-4 shrink-0" fallbackClassName="text-[8px]" />
                          {name}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                {/* Étoile IA : petit bouton de la hauteur de l'input. Quand personne n'est assigné,
                    il « brille » (primary) pour appeler l'action ; sinon discret (re-analyse). */}
                {workspaceSlug && projectId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (smartOpen) { setSmartOpen(false); return }
                      setSmartOpen(true)
                      setSmartRun((t) => t + 1)
                    }}
                    title="Assign with AI"
                    aria-label="Assign with AI"
                    aria-pressed={smartOpen}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                      smartOpen
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : noAssignee
                          ? "border-primary/30 bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 hover:bg-primary/20"
                          : "border-input text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <Sparkles className="size-4" />
                  </button>
                )}
              </div>
            </MetaRow>

            {/* Smart Auto-Assign - panneau contrôlé, ouvert par l'étoile IA ci-dessus */}
            {workspaceSlug && projectId && (
              <SmartAssignPanel
                open={smartOpen}
                onOpenChange={setSmartOpen}
                runToken={smartRun}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueLabels={labels.map((l) => l.name)}
                issuePriority={priority}
                currentAssignee={assignee}
                onAssign={async (m) => {
                  const initials = (m.displayName ?? m.email).slice(0, 2).toUpperCase()
                  const color = memberColor(m.userId)
                  const name = m.displayName ?? m.email
                  setAssignee({ initials, color, name, userId: m.userId, email: m.email, avatarUrl: m.avatarUrl })
                  await callUpdate({ assigneeId: m.userId })
                  toast.success(`Assigned to ${name}`)
                }}
              />
            )}

            {/* Labels - multi-select */}
            <MetaRow icon={<Tag className="size-3.5" />} label="Labels">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs outline-none transition-colors hover:bg-muted/30 dark:bg-input/30 dark:hover:bg-input/50">
                    <div className="flex min-w-0 flex-wrap gap-1">
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
                        : <span className="text-muted-foreground">Add label</span>}
                    </div>
                    <ChevronDown className="size-4 shrink-0 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-40">
                  {(labelsByProject[projectId ?? 0] ?? []).length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                      No labels - create some in project settings
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

            {/* Points - select de presets (estimation d'effort), persiste en base */}
            <MetaRow icon={<Layers className="size-3.5" />} label="Points">
              <Select
                value={points === null ? "none" : String(points)}
                onValueChange={async (val) => {
                  const pt = val === "none" ? null : Number(val)
                  setPoints(pt)
                  // 0 = retirer l'estimation côté backend
                  await callUpdate({ storyPoints: pt ?? 0 })
                  toast.success("Points updated")
                }}
              >
                <SelectTrigger size="sm" className="w-full">
                  <span>{points === null ? "-" : `${points} pts`}</span>
                </SelectTrigger>
                <SelectContent>
                  {STORY_POINT_PRESETS.map((pt) => (
                    <SelectItem key={pt ?? "none"} value={pt === null ? "none" : String(pt)}>
                      {pt === null ? "No estimate" : `${pt} pts`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaRow>

            {/* Cycle - sélecteur réel (CYC-03b). Le back expose désormais le cycle courant de l'issue
                (GET .../issues/{id}/cycles). « Changer » = retirer du cycle précédent puis ajouter au
                nouveau (pas d'endpoint « move »). On appelle les fns service en direct (le store avale
                les erreurs) pour un vrai feedback. */}
            {workspaceSlug && projectId && issue && (
              <MetaRow icon={<RefreshCw className="size-3.5" />} label="Cycle">
                <Select
                  value={cycleId === null ? "none" : String(cycleId)}
                  onValueChange={async (val) => {
                    const next = val === "none" ? null : Number(val)
                    const prev = cycleId
                    if (next === prev) return
                    setCycleId(next)
                    try {
                      if (prev !== null) await removeIssueFromCycle(workspaceSlug, projectId, prev, issueId)
                      if (next !== null) await addIssueToCycle(workspaceSlug, projectId, next, issueId)
                      toast.success(next !== null ? "Cycle updated" : "Removed from cycle")
                    } catch {
                      setCycleId(prev)
                      toast.error("Could not update cycle")
                    }
                  }}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <span>{cycleId === null ? "No cycle" : (projectCycles.find((c) => c.id === cycleId)?.name ?? "-")}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No cycle</SelectItem>
                    {projectCycles.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MetaRow>
            )}

            {/* Due date - sélecteur de date shadcn (Calendar + Popover) */}
            <MetaRow icon={<Calendar className="size-3.5" />} label="Due date">
              <DatePicker
                value={dueIso}
                onChange={saveDueDate}
                placeholder="-"
                className={cn(isOverdue && "border-red-500/40 text-red-400 hover:text-red-400")}
              />
              {isOverdue && (
                <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-400">
                  <AlertTriangle className="size-3" /> Overdue
                </span>
              )}
            </MetaRow>

            {/* Created - read-only (reste dans la liste de propriétés) */}
            <MetaRow icon={<Activity className="size-3.5" />} label="Created">
              <span className="text-xs text-muted-foreground">{issue.createdAt}</span>
            </MetaRow>

            {/* Suivi du temps - bloc dédié en bas (plus lourd que les propriétés → isolé sous un séparateur) */}
            {workspaceSlug && projectId && (
              <>
                <Separator className="my-3" />
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" />
                    <span>Time tracking</span>
                  </div>
                  <WorklogTab issueId={issueId} projectId={projectId} workspaceSlug={workspaceSlug} />
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
