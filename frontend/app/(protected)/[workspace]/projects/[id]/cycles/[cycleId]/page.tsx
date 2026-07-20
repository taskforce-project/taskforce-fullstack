"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  CircleDot,
  TrendingUp,
  Calendar,
  Loader2,
  AlertCircle,
  Plus,
  X,
  MoreHorizontal,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import { cn } from "@/lib/utils"
import { useCycleStore } from "@/lib/store/cycle-store"
import { useIssueStore } from "@/lib/store/issue-store"
import type { CycleStatus } from "@/lib/api/cycle-service"
import type { Issue, IssuePriority, IssueStatusCategory } from "@/lib/api/issue-service"
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CYCLE_STATUS_CONFIG: Record<CycleStatus, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  ACTIVE:    { label: "Active",    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> },
  DRAFT:     { label: "Draft",     badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",         icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  COMPLETED: { label: "Completed", badgeClass: "bg-muted text-muted-foreground border-border",             icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
}

const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-red-400",
  HIGH:   "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW:    "bg-slate-400",
  NONE:   "bg-muted-foreground/30",
}

function getCategoryIcon(category: IssueStatusCategory): React.ReactNode {
  switch (category) {
    case "STARTED":   return <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
    case "COMPLETED": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    default:          return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function getCategoryLabel(category: IssueStatusCategory): string {
  switch (category) {
    case "STARTED":   return "In Progress"
    case "COMPLETED": return "Done"
    case "CANCELLED": return "Cancelled"
    case "BACKLOG":   return "Backlog"
    default:          return "Todo"
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return iso
  }
}

function daysLeft(endDate: string | null | undefined): number | null {
  if (!endDate) return null
  const diff = new Date(endDate).getTime() - Date.now()
  return diff > 0 ? Math.ceil(diff / 86400000) : null
}

// ---------------------------------------------------------------------------
// IssueRow
// ---------------------------------------------------------------------------

function IssueRow({
  issue, slug, projectId, cycleId, onRemoved,
}: Readonly<{
  issue: Issue
  slug: string
  projectId: number
  cycleId: number
  onRemoved: () => void | Promise<void>
}>) {
  const { removeIssueFromCycle } = useCycleStore()
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    setRemoving(true)
    try {
      await removeIssueFromCycle(slug, projectId, cycleId, issue.id)
      toast.success(`${issue.identifier} retirée du cycle`)
      await onRemoved()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0">
      <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
      {getCategoryIcon(issue.status.category)}
      {/* Ligne cliquable → ouvre l'issue via le deep-link board (?issue=), les issues n'ayant
          pas de route dédiée (elles s'ouvrent en sheet). CYC-03a. */}
      <Link
        href={`/${slug}/projects/${projectId}?issue=${issue.id}`}
        className="flex items-center gap-3 flex-1 min-w-0 group/link"
      >
        <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">{issue.identifier}</span>
        <span className="text-sm text-foreground flex-1 min-w-0 truncate group-hover/link:text-primary transition-colors">{issue.title}</span>
      </Link>
      {issue.assignee ? (
        <UserAvatar
          email={issue.assignee.email}
          name={issue.assignee.displayName ?? issue.assignee.email}
          avatarUrl={issue.assignee.avatarUrl}
          className="h-6 w-6 shrink-0"
          fallbackClassName="text-[9px]"
        />
      ) : (
        <div className="size-6 rounded-full border border-dashed border-border shrink-0" />
      )}
      <button
        onClick={handleRemove}
        disabled={removing}
        aria-label={`Retirer ${issue.identifier} du cycle`}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
      >
        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

/**
 * Dialog d'ajout d'issues au cycle (C3). `addIssueToCycle` existait dans le store et n'avait AUCUN
 * appelant → un cycle restait vide à vie, et la rétro Brain OS (déclenchée à la clôture) n'avait aucun
 * fait d'issue à synthétiser.
 *
 * <p>Le backend n'expose PAS le cycle d'une issue (pas de reverse-lookup sur `IssueResponse`), donc on
 * exclut les candidats en comparant à la liste des issues DÉJÀ dans le cycle (`alreadyIn`) — l'info
 * qu'on possède réellement, plutôt qu'un champ fantôme.</p>
 */
function AddIssuesDialog({
  slug, projectId, cycleId, alreadyIn, onAdded,
}: Readonly<{
  slug: string
  projectId: number
  cycleId: number
  alreadyIn: Set<number>
  onAdded: () => void | Promise<void>
}>) {
  const { fetchIssues } = useIssueStore()
  const { addIssueToCycle } = useCycleStore()
  const [open, setOpen] = useState(false)
  const [projectIssues, setProjectIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetchIssues(slug, projectId)
      .then(setProjectIssues)
      .finally(() => setLoading(false))
  }, [open, slug, projectId, fetchIssues])

  // Candidats = issues du projet pas encore dans ce cycle.
  const candidates = projectIssues.filter((i) => !alreadyIn.has(i.id))

  async function handleAdd(issue: Issue) {
    setAddingId(issue.id)
    try {
      await addIssueToCycle(slug, projectId, cycleId, issue.id)
      toast.success(`${issue.identifier} ajoutée au cycle`)
      await onAdded()
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Plus className="h-3.5 w-3.5" /> Ajouter des issues
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter des issues au cycle</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Chargement…</span>
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Toutes les issues du projet sont déjà dans ce cycle.
          </p>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="flex flex-col">
              {candidates.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => handleAdd(issue)}
                  disabled={addingId !== null}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-md text-left disabled:opacity-50"
                >
                  <div className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[issue.priority])} />
                  <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">{issue.identifier}</span>
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{issue.title}</span>
                  {addingId === issue.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                    : <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CycleDetailPage() {
  const params = useParams()

  const workspaceRaw = params.workspace
  let workspace = ""
  if (typeof workspaceRaw === "string") workspace = workspaceRaw
  else if (Array.isArray(workspaceRaw)) workspace = workspaceRaw[0] ?? ""

  const idRaw = params.id
  let projectId = 0
  if (typeof idRaw === "string") projectId = Number(idRaw)
  else if (Array.isArray(idRaw)) projectId = Number(idRaw[0] ?? "0")

  const cycleIdRaw = params.cycleId
  let cycleId = 0
  if (typeof cycleIdRaw === "string") cycleId = Number(cycleIdRaw)
  else if (Array.isArray(cycleIdRaw)) cycleId = Number(cycleIdRaw[0] ?? "0")

  const { activeCycle: cycle, cycleIssues: issues, isLoading, error, fetchCycle, fetchCycleIssues, updateCycle, deleteCycle } = useCycleStore()
  const router = useRouter()
  const [acting, setActing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (workspace && projectId && cycleId) {
      fetchCycle(workspace, projectId, cycleId)
      fetchCycleIssues(workspace, projectId, cycleId)
    }
  }, [workspace, projectId, cycleId, fetchCycle, fetchCycleIssues])

  // Transitions (Démarrer/Terminer/Rouvrir) et suppression, surfacées ici : la page détail est la
  // destination commune de My Work et de la liste projet, alors que le menu riche n'existait que sur
  // la page /cycles (hors sidebar). CYC-02/04/08.
  async function handleTransition(next: CycleStatus, label: string) {
    setActing(true)
    try {
      const updated = await updateCycle(workspace, projectId, cycleId, { status: next })
      if (updated) toast.success(label)
    } finally {
      setActing(false)
    }
  }

  async function handleDelete() {
    setActing(true)
    try {
      await deleteCycle(workspace, projectId, cycleId)
      toast.success("Cycle supprimé")
      router.push(`/${workspace}/projects/${projectId}/cycles`)
    } finally {
      setActing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading cycle…</span>
      </div>
    )
  }

  if (error || !cycle) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        {error && <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
        {!cycle && !error && <p className="text-sm">Cycle not found.</p>}
        <Link href={`/${workspace}/projects/${projectId}/cycles`}>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to cycles
          </Button>
        </Link>
      </div>
    )
  }

  const cfg  = CYCLE_STATUS_CONFIG[cycle.status]
  const left = daysLeft(cycle.endDate)

  // Grouper les issues par catégorie de statut
  const ORDER: IssueStatusCategory[] = ["STARTED", "UNSTARTED", "BACKLOG", "COMPLETED", "CANCELLED"]
  const grouped = new Map<IssueStatusCategory, Issue[]>()
  for (const cat of ORDER) grouped.set(cat, [])
  for (const issue of issues) {
    grouped.get(issue.status.category)?.push(issue)
  }

  const completedCount = issues.filter((i) => i.status.category === "COMPLETED").length
  const totalCount     = issues.length

  // Ids déjà dans le cycle → exclus des candidats à l'ajout (le back n'expose pas le cycle d'une issue).
  const alreadyIn = new Set(issues.map((i) => i.id))
  const reloadIssues = async () => { await fetchCycleIssues(workspace, projectId, cycleId) }
  const progress       = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Back nav */}
      <Link
        href={`/${workspace}/projects/${projectId}/cycles`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All cycles
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {cfg.icon}
            <div>
              <h1 className="text-lg font-semibold text-foreground">{cycle.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", cfg.badgeClass)}>
                  {cfg.label}
                </Badge>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
                  {left !== null && <span className="text-amber-400 font-medium ml-1">{left}d left</span>}
                </span>
              </div>
              {cycle.description && (
                <p className="mt-2 text-sm text-muted-foreground max-w-lg">{cycle.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            {totalCount > 0 && (
              <div className="flex items-center gap-4 rounded-lg bg-muted/30 px-4 py-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground tabular-nums">{progress}%</p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <div className="text-center">
                    <p className="text-lg font-semibold text-foreground tabular-nums">{completedCount}/{totalCount}</p>
                    <p className="text-xs text-muted-foreground">Issues done</p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions du cycle — Démarrer / Terminer / Rouvrir / Supprimer (CYC-02/04/08). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled={acting} aria-label="Actions du cycle">
                  {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {cycle.status === "DRAFT" && (
                  <DropdownMenuItem onClick={() => handleTransition("ACTIVE", "Cycle démarré")}>
                    <Play className="h-3.5 w-3.5" /> Démarrer le cycle
                  </DropdownMenuItem>
                )}
                {cycle.status === "ACTIVE" && (
                  <DropdownMenuItem onClick={() => handleTransition("COMPLETED", "Cycle terminé")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Terminer le cycle
                  </DropdownMenuItem>
                )}
                {cycle.status === "COMPLETED" && (
                  <DropdownMenuItem onClick={() => handleTransition("ACTIVE", "Cycle rouvert")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Rouvrir le cycle
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer le cycle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DeleteConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Supprimer le cycle ?"
              description={`« ${cycle.name} » sera supprimé. Les issues rattachées ne sont pas supprimées. Action irréversible.`}
              confirmLabel="Supprimer le cycle"
              variant="danger"
              onConfirm={handleDelete}
            />
          </div>
        </div>

        {totalCount > 0 && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progress === 100 ? "bg-emerald-500" : "bg-primary")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Issues */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Issues du cycle</h2>
        <AddIssuesDialog
          slug={workspace}
          projectId={projectId}
          cycleId={cycleId}
          alreadyIn={alreadyIn}
          onAdded={reloadIssues}
        />
      </div>
      {issues.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed bg-card p-12 text-center text-muted-foreground text-sm">
          Aucune issue dans ce cycle. Cliquez sur « Ajouter des issues » pour en rattacher.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ORDER.map((cat) => {
            const group = grouped.get(cat) ?? []
            if (group.length === 0) return null
            return (
              <div key={cat} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {getCategoryIcon(cat)}
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {getCategoryLabel(cat)}
                  </span>
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{group.length}</Badge>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
                  {group.map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      slug={workspace}
                      projectId={projectId}
                      cycleId={cycleId}
                      onRemoved={reloadIssues}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
