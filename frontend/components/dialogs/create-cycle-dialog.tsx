"use client"

import { useState } from "react"
import { format } from "date-fns"
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateCyclePayload {
  name: string
  description: string
  projectId: string
  startDate: Date
  endDate: Date
}

interface CreateCycleDialogProps {
  readonly children?: React.ReactNode
  readonly onCreated?: (payload: CreateCyclePayload) => void
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECTS = [
  { id: "1", name: "Website Redesign", emoji: "🎨" },
  { id: "2", name: "Mobile App", emoji: "📱" },
  { id: "3", name: "API v2", emoji: "⚡" },
]

// ---------------------------------------------------------------------------
// CreateCycleDialog
// ---------------------------------------------------------------------------

export function CreateCycleDialog({ children, onCreated }: CreateCycleDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [projectId, setProjectId] = useState<string>(PROJECTS[0].id)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [startOpen, setStartOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)

  const selectedProject = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]
  const canCreate = name.trim().length > 0 && startDate !== undefined && endDate !== undefined

  function handleCreate() {
    if (!name.trim() || !startDate || !endDate) return
    onCreated?.({
      name: name.trim(),
      description,
      projectId,
      startDate,
      endDate,
    })
    resetForm()
    setOpen(false)
  }

  function resetForm() {
    setName("")
    setDescription("")
    setProjectId(PROJECTS[0].id)
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

          {/* Project */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between w-full font-normal">
                  <span className="flex items-center gap-2">
                    <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{selectedProject.emoji} {selectedProject.name}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {PROJECTS.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setProjectId(p.id)}
                    className={cn("gap-2", p.id === projectId && "bg-accent")}
                  >
                    <span>{p.emoji}</span>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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
          <Button size="sm" onClick={handleCreate} disabled={!canCreate} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Create cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
