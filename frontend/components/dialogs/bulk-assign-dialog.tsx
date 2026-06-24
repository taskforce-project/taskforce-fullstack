"use client"

import { useState } from "react"
import { Sparkles, Loader2, Check } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useIssueStore } from "@/lib/store/issue-store"
import { smartAssignBulk, type Issue, type SmartAssignCandidate } from "@/lib/api/issue-service"

interface Row {
  issueId: number
  identifier: string
  title: string
  candidate: SmartAssignCandidate
  selected: boolean
}

interface BulkAssignDialogProps {
  readonly slug: string
  readonly projectId: number
  readonly issues: Issue[]
}

/**
 * Multi-assign (PROD-1.9) : recommande puis assigne en lot toutes les issues non assignées.
 */
export function BulkAssignDialog({ slug, projectId, issues }: BulkAssignDialogProps) {
  const { updateIssue } = useIssueStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [ran, setRan] = useState(false)
  const [rows, setRows] = useState<Row[]>([])

  const unassigned = issues.filter((i) => i.assignee == null)
  const selectedCount = rows.filter((r) => r.selected).length

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) { setRows([]); setRan(false); return }
    if (unassigned.length === 0) return

    setLoading(true)
    setRan(false)
    try {
      const items = await smartAssignBulk(slug, projectId, unassigned.map((i) => i.id))
      const byId = new Map(issues.map((i) => [i.id, i]))
      const next2: Row[] = items
        .filter((it) => it.recommended)
        .map((it) => {
          const issue = byId.get(it.issueId)
          return {
            issueId: it.issueId,
            identifier: issue?.identifier ?? `#${it.issueId}`,
            title: issue?.title ?? "",
            candidate: it.recommended!,
            selected: true,
          }
        })
      setRows(next2)
      setRan(true)
      if (next2.length === 0) toast.warning("Aucune recommandation — ajoute des membres ou des compétences")
    } catch {
      toast.error("Impossible de générer les recommandations")
    } finally {
      setLoading(false)
    }
  }

  function toggle(issueId: number) {
    setRows((rs) => rs.map((r) => (r.issueId === issueId ? { ...r, selected: !r.selected } : r)))
  }

  async function applyAll() {
    const selected = rows.filter((r) => r.selected)
    if (selected.length === 0) return
    setApplying(true)
    try {
      await Promise.all(
        selected.map((r) => updateIssue(slug, projectId, r.issueId, { assigneeId: r.candidate.userId }))
      )
      toast.success(`${selected.length} issue${selected.length > 1 ? "s" : ""} assignée${selected.length > 1 ? "s" : ""}`)
      setOpen(false)
      setRows([])
      setRan(false)
    } catch {
      toast.error("Échec de l'assignation")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={unassigned.length > 0 ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={unassigned.length === 0}
        >
          <Sparkles className={`size-3.5 ${unassigned.length > 0 ? "" : "text-primary"}`} />
          Auto-assign{unassigned.length > 0 ? ` (${unassigned.length})` : ""}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Smart Assign — issues non assignées
          </DialogTitle>
          <DialogDescription>
            Recommandations basées sur compétences, charge et disponibilité. Décoche celles à exclure.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : ran && rows.length > 0 ? (
          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
            {rows.map((r) => (
              <button
                key={r.issueId}
                type="button"
                onClick={() => toggle(r.issueId)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                  r.selected ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                )}
              >
                <span className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  r.selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                )}>
                  {r.selected && <Check className="size-3" />}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0 truncate">{r.identifier}</span>
                <span className="flex-1 text-xs truncate">{r.title}</span>
                <UserAvatar
                  email={r.candidate.email}
                  name={r.candidate.displayName ?? r.candidate.email}
                  avatarUrl={r.candidate.avatarUrl}
                  className="size-5 shrink-0"
                  fallbackClassName="text-[8px]"
                />
                <span className="hidden sm:block text-xs truncate max-w-28">{r.candidate.displayName ?? r.candidate.email}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">{r.candidate.score}%</Badge>
              </button>
            ))}
          </div>
        ) : ran ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune recommandation disponible.</p>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{unassigned.length} issue(s) non assignée(s) à traiter.</p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={applying}>
            Annuler
          </Button>
          <Button size="sm" className="gap-1.5" onClick={applyAll} disabled={applying || selectedCount === 0}>
            {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Assigner{selectedCount > 0 ? ` ${selectedCount}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
