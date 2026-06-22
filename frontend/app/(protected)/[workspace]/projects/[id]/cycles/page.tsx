"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  RefreshCw,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useCycleStore } from "@/lib/store/cycle-store"
import type { Cycle, CycleStatus } from "@/lib/api/cycle-service"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CYCLE_STATUS_CONFIG: Record<CycleStatus, { badgeClass: string; label: string; icon: React.ReactNode }> = {
  ACTIVE:    { badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "Active",    icon: <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> },
  DRAFT:     { badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",         label: "Draft",     icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  COMPLETED: { badgeClass: "bg-muted text-muted-foreground border-border",             label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
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
// New Cycle Dialog
// ---------------------------------------------------------------------------

interface NewCycleDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onCreate: (name: string, description: string, startDate: string, endDate: string) => Promise<void>
}

function NewCycleDialog({ open, onClose, onCreate }: NewCycleDialogProps) {
  const [name, setName]               = useState("")
  const [description, setDescription] = useState("")
  const [startDate, setStartDate]     = useState("")
  const [endDate, setEndDate]         = useState("")
  const [saving, setSaving]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onCreate(name.trim(), description.trim(), startDate, endDate)
    setSaving(false)
    setName(""); setDescription(""); setStartDate(""); setEndDate("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Cycle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cycle-name">Name *</Label>
            <Input
              id="cycle-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sprint 5 — Feature X"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cycle-desc">Description</Label>
            <Textarea
              id="cycle-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this cycle is about…"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycle-start">Start date</Label>
              <DatePicker id="cycle-start" value={startDate} onChange={setStartDate} placeholder="Début" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycle-end">End date</Label>
              <DatePicker id="cycle-end" value={endDate} onChange={setEndDate} placeholder="Fin" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// CycleCard
// ---------------------------------------------------------------------------

function CycleCard({ cycle, href }: { readonly cycle: Cycle; readonly href: string }) {
  const cfg  = CYCLE_STATUS_CONFIG[cycle.status]
  const left = daysLeft(cycle.endDate)

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/40 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)]"
    >
      <div className="shrink-0">{cfg.icon}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
            {cycle.name}
          </span>
          <Badge variant="outline" className={cn("text-xs border px-1.5 py-0", cfg.badgeClass)}>
            {cfg.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
          {left !== null && <span className="ml-2 text-amber-400">{left}d left</span>}
        </p>
      </div>

      {cycle.issueCount > 0 ? (
        <span className="text-xs text-muted-foreground hidden md:block shrink-0">
          {cycle.issueCount} issue{cycle.issueCount !== 1 ? "s" : ""}
        </span>
      ) : (
        <span className="text-xs text-amber-400/80 hidden md:block shrink-0">Aucune issue — à remplir</span>
      )}

      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectCyclesPage() {
  const params = useParams()

  const workspaceRaw = params.workspace
  let workspace = ""
  if (typeof workspaceRaw === "string") workspace = workspaceRaw
  else if (Array.isArray(workspaceRaw)) workspace = workspaceRaw[0] ?? ""

  const idRaw = params.id
  let projectId = 0
  if (typeof idRaw === "string") projectId = Number(idRaw)
  else if (Array.isArray(idRaw)) projectId = Number(idRaw[0] ?? "0")

  const { cycles, isLoading, error, fetchCycles, createCycle } = useCycleStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (workspace && projectId) {
      fetchCycles(workspace, projectId)
    }
  }, [workspace, projectId, fetchCycles])

  async function handleCreate(name: string, description: string, startDate: string, endDate: string) {
    await createCycle(workspace, projectId, {
      name,
      description: description || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading cycles…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Les <span className="font-medium text-foreground">cycles</span> (sprints) sont des itérations limitées dans le temps :
        regroupez-y des issues pour suivre la vélocité, la charge et les échéances de l'équipe.
      </p>
      <div className="flex items-center justify-between">
        {error ? (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{cycles.length} cycle{cycles.length !== 1 ? "s" : ""}</p>
        )}
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Cycle
        </Button>
      </div>

      {cycles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <RefreshCw className="h-8 w-8 opacity-30" />
          <p className="text-sm">Aucun cycle. Créez un sprint pour planifier vos issues dans le temps.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              href={`/${workspace}/projects/${projectId}/cycles/${cycle.id}`}
            />
          ))}
        </div>
      )}

      <NewCycleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
