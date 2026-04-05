"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Plus,
  Users,
  FolderKanban,
  MoreHorizontal,
  Crown,
  X,
  Settings,
  ChevronRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  name: string
  initials: string
  color: string
  role: "lead" | "member"
}

interface Team {
  id: string
  name: string
  description: string
  color: string
  emoji: string
  members: TeamMember[]
  projectsCount: number
  issuesCount: number
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TEAMS: Team[] = [
  {
    id: "1",
    name: "Frontend",
    description: "Responsible for all user-facing interfaces, design system, and web performance.",
    color: "bg-violet-500",
    emoji: "🎨",
    members: [
      { name: "Sophie Martin", initials: "SM", color: "bg-violet-500", role: "lead" },
      { name: "You", initials: "ME", color: "bg-primary", role: "member" },
      { name: "Emma Petit", initials: "EP", color: "bg-emerald-500", role: "member" },
    ],
    projectsCount: 2,
    issuesCount: 24,
    updatedAt: "2 hours ago",
  },
  {
    id: "2",
    name: "Backend",
    description: "API development, database architecture, authentication, and infrastructure.",
    color: "bg-blue-500",
    emoji: "⚙️",
    members: [
      { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500", role: "lead" },
      { name: "You", initials: "ME", color: "bg-primary", role: "member" },
      { name: "Lucas Dufour", initials: "LD", color: "bg-blue-500", role: "member" },
    ],
    projectsCount: 2,
    issuesCount: 18,
    updatedAt: "Yesterday",
  },
  {
    id: "3",
    name: "DevOps",
    description: "CI/CD, deployment pipelines, monitoring, and cloud infrastructure management.",
    color: "bg-emerald-500",
    emoji: "🚀",
    members: [
      { name: "Lucas Dufour", initials: "LD", color: "bg-blue-500", role: "lead" },
    ],
    projectsCount: 1,
    issuesCount: 9,
    updatedAt: "3 days ago",
  },
  {
    id: "4",
    name: "Product",
    description: "Product strategy, roadmap planning, user research, and feature prioritization.",
    color: "bg-amber-500",
    emoji: "📋",
    members: [
      { name: "You", initials: "ME", color: "bg-primary", role: "lead" },
      { name: "Sophie Martin", initials: "SM", color: "bg-violet-500", role: "member" },
    ],
    projectsCount: 3,
    issuesCount: 31,
    updatedAt: "Last week",
  },
]

// ---------------------------------------------------------------------------
// CreateTeamDialog
// ---------------------------------------------------------------------------

function CreateTeamDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  function handleCreate() {
    if (!name.trim()) return
    setName("")
    setDescription("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-9">
          <Plus className="size-4" />
          New team
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            Teams help you organize members by function, department, or project focus.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="team-name" className="text-sm font-medium text-foreground">Team name</label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Frontend, Backend, Design…"
              className="h-9"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="team-description" className="text-sm font-medium text-foreground">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team work on?"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-18"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim()} className="gap-2">
            <Plus className="size-4" />
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// TeamSettingsSheet
// ---------------------------------------------------------------------------

function TeamSettingsSheet({ team, open, onOpenChange }: { readonly team: Team; readonly open: boolean; readonly onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description)

  function handleSave() {
    toast.success("Équipe mise à jour", { description: `${name} a été sauvegardé.` })
    onOpenChange(false)
  }

  function handleDelete() {
    toast.error("Équipe supprimée", { description: `${team.name} a été supprimée.` })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="px-6 pt-2">
          <SheetTitle className="flex items-center gap-2">
            <span>{team.emoji}</span>
            Settings — {team.name}
          </SheetTitle>
          <SheetDescription>Modifier les paramètres de l&apos;équipe</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 mt-6 px-6 pb-6">
          {/* General */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Général</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nom</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <Button size="sm" className="w-fit gap-2" onClick={handleSave}>
              Sauvegarder
            </Button>
          </div>

          <Separator />

          {/* Members */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Membres</h3>
            {team.members.map((m) => (
              <div key={m.name} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={cn("text-xs text-white", m.color)}>{m.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                </div>
                {m.role !== "lead" && (
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                    Retirer
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-2 w-fit mt-1">
              <Users className="h-3.5 w-3.5" />
              Ajouter un membre
            </Button>
          </div>

          <Separator />

          {/* Danger */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide">Zone de danger</h3>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Supprimer cette équipe</p>
                <p className="text-xs text-muted-foreground mt-0.5">Action irréversible.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleDelete} className="shrink-0">
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// TeamCard
// ---------------------------------------------------------------------------

function TeamCard({ team }: { readonly team: Team }) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <TeamSettingsSheet team={team} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <div className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-linear-to-br from-muted to-muted/50 flex items-center justify-center text-xl shrink-0">
            {team.emoji}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
              {team.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{team.description}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-4" /> Team settings
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Users className="size-4" /> Manage members
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Delete team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Members */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {team.members.slice(0, 5).map((m) => (
              <Avatar key={m.name} className="size-7 ring-2 ring-card">
                <AvatarFallback className={cn("text-[9px] text-white font-semibold", m.color)}>
                  {m.initials}
                </AvatarFallback>
              </Avatar>
            ))}
            {team.members.length > 5 && (
              <div className="size-7 rounded-full bg-muted ring-2 ring-card flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground">+{team.members.length - 5}</span>
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{team.members.length} member{team.members.length !== 1 && "s"}</span>
        </div>

        {/* Lead badge */}
        {team.members.find((m) => m.role === "lead") && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Crown className="size-3 text-amber-400" />
            <span>{team.members.find((m) => m.role === "lead")?.name}</span>
          </div>
        )}
      </div>

      {/* Stats + footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FolderKanban className="size-3.5" />
            {team.projectsCount} project{team.projectsCount !== 1 && "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <ChevronRight className="size-3.5" />
            {team.issuesCount} issues
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{team.updatedAt}</span>
      </div>
    </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamsPage() {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search.trim()) return MOCK_TEAMS
    const q = search.toLowerCase()
    return MOCK_TEAMS.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {MOCK_TEAMS.length} teams · Organize members by function or department
          </p>
        </div>
        <CreateTeamDialog />
      </div>

      {/* Toolbar */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams…"
          className="pl-8 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="size-10 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium text-foreground">No teams found</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </div>
  )
}
