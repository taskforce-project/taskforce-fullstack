"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import {
  RefreshCw,
  CalendarIcon,
  FolderKanban,
  ChevronDown,
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
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/lib/store/project-store"
import { useCycleStore } from "@/lib/store/cycle-store"
import type { Cycle } from "@/lib/api/cycle-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Le payload local a disparu : il décrivait un objet que le dialog passait à un callback jamais fourni.
// Le contrat qui compte est celui du service (`CreateCyclePayload` de cycle-service), et l'appelant
// reçoit désormais le `Cycle` réellement persisté.

interface CreateCycleDialogProps {
  readonly children?: React.ReactNode
  /** Notifié APRÈS persistance réussie, avec le cycle créé. Optionnel : la création n'en dépend pas. */
  readonly onCreated?: (cycle: Cycle) => void
  /** Verrouille le cycle sur un projet précis (masque le sélecteur) — page cycles d'un projet. */
  readonly projectId?: number
}

// ---------------------------------------------------------------------------
// CreateCycleDialog
// ---------------------------------------------------------------------------

export function CreateCycleDialog({ children, onCreated, projectId }: CreateCycleDialogProps) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const { projects, fetchProjects } = useProjectStore()
  const { createCycle } = useCycleStore()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [pickedProjectId, setPickedProjectId] = useState<string>("")
  // Projet effectif : verrouillé par la prop (page d'un projet) sinon choisi dans le sélecteur.
  const effectiveProjectId = projectId != null ? String(projectId) : pickedProjectId
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [startOpen, setStartOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Load projects when dialog opens
  useEffect(() => {
    if (open && slug) fetchProjects(slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slug])

  // Set default project once projects are loaded (sauf si un projet est verrouillé par la prop).
  useEffect(() => {
    if (projectId == null && projects.length > 0 && !pickedProjectId) setPickedProjectId(String(projects[0].id))
  }, [projects, pickedProjectId, projectId])

  const selectedProject = projects.find((p) => String(p.id) === effectiveProjectId) ?? projects[0]
  const canCreate = name.trim().length > 0 && startDate !== undefined && endDate !== undefined

  /**
   * ⚠️ Ce dialog ne persistait RIEN. Il se contentait de `onCreated?.(payload)` — et ses deux usages
   * (`cycles/page.tsx`) l'instancient **sans aucune prop**, donc `onCreated` était `undefined` et
   * l'appel un no-op. Formulaire rempli, dialog fermé, aucune erreur, **aucun cycle créé**.
   * Il appelle désormais le store lui-même, comme `create-project-dialog`. `onCreated` reste optionnel
   * pour les appelants qui veulent réagir, mais la création ne dépend plus de lui.
   */
  async function handleCreate() {
    if (!name.trim() || !startDate || !endDate || !slug) return
    const pid = projectId ?? Number(pickedProjectId)
    if (!Number.isFinite(pid) || pid <= 0) return

    setIsLoading(true)
    try {
      // Le backend attend des LocalDate → "yyyy-MM-dd" (pas un ISO complet avec heure).
      const cycle = await createCycle(slug, pid, {
        name: name.trim(),
        description: description.trim() || undefined,
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      })
      // On ne ferme QUE si la création a abouti : sinon le formulaire reste, avec sa saisie.
      if (cycle) {
        toast.success(`Cycle « ${cycle.name} » créé`)
        onCreated?.(cycle)
        resetForm()
        setOpen(false)
      }
    } finally {
      setIsLoading(false)
    }
  }

  function resetForm() {
    setName("")
    setDescription("")
    setPickedProjectId(projects.length > 0 ? String(projects[0].id) : "")
    setStartDate(undefined)
    setEndDate(undefined)
    setStartOpen(false)
    setEndOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            New cycle
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            New Cycle
          </DialogTitle>
          <DialogDescription>
            Create a new sprint cycle to group and track issues over a time period.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cycle-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Name
            </label>
            <Input
              id="cycle-name"
              placeholder="Sprint 12 – Auth & Onboarding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cycle-description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Description <span className="normal-case text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              id="cycle-description"
              placeholder="Goals and scope for this cycle…"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Project — masqué quand le dialogue est verrouillé sur un projet (page cycles d'un projet). */}
          {projectId == null && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-between w-full font-normal">
                    <span className="flex items-center gap-2">
                      <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{selectedProject ? `${selectedProject.identifier.slice(0, 2)} ${selectedProject.name}` : "Select project…"}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {projects.length === 0 && (
                    <DropdownMenuItem disabled>No projects found</DropdownMenuItem>
                  )}
                  {projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => setPickedProjectId(String(p.id))}
                      className={cn("gap-2", String(p.id) === effectiveProjectId && "bg-accent")}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{p.identifier.slice(0, 2)}</span>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start date</span>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("justify-start font-normal gap-2", !startDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => { setStartDate(d); setStartOpen(false) }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End date</span>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("justify-start font-normal gap-2", !endDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => { setEndDate(d); setEndOpen(false) }}
                    disabled={(d) => startDate ? d < startDate : false}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate || isLoading} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Create cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
