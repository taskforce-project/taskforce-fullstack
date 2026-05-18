"use client"

import { useState, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import {
  Search,
  Plus,
  Users,
  MoreHorizontal,
  Crown,
  X,
  Settings,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { useTeamStore } from "@/lib/store/team-store"
import type { Team, TeamMember } from "@/lib/api/team-service"

// ---------------------------------------------------------------------------
// CreateTeamDialog
// ---------------------------------------------------------------------------

function CreateTeamDialog({ slug }: { readonly slug: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const createTeam = useTeamStore((s) => s.createTeam)

  async function handleCreate() {
    if (!name.trim()) return
    try {
      await createTeam(slug, { name: name.trim(), description: description.trim() || undefined })
      toast.success("Équipe créée", { description: `${name} a été créée.` })
      setName("")
      setDescription("")
      setOpen(false)
    } catch {
      toast.error("Erreur lors de la création de l'équipe")
    }
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

function TeamSettingsSheet({
  team,
  slug,
  open,
  onOpenChange,
}: {
  readonly team: Team
  readonly slug: string
  readonly open: boolean
  readonly onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? "")
  const updateTeam = useTeamStore((s) => s.updateTeam)
  const deleteTeam = useTeamStore((s) => s.deleteTeam)
  const removeMember = useTeamStore((s) => s.removeMember)

  async function handleSave() {
    try {
      await updateTeam(slug, team.id, { name: name.trim(), description: description.trim() || undefined })
      toast.success("Équipe mise à jour", { description: `${name} a été sauvegardé.` })
      onOpenChange(false)
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  async function handleDelete() {
    try {
      await deleteTeam(slug, team.id)
      toast.error("Équipe supprimée", { description: `${team.name} a été supprimée.` })
      onOpenChange(false)
    } catch {
      toast.error("Erreur lors de la suppression")
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    try {
      await removeMember(slug, team.id, member.userId)
      toast.success(`${member.displayName} a été retiré de l'équipe`)
    } catch {
      toast.error("Erreur lors du retrait du membre")
    }
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
              <label htmlFor="team-name" className="text-sm font-medium">Nom</label>
              <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="team-description" className="text-sm font-medium">Description</label>
              <textarea
                id="team-description"
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
              <div key={m.id} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                  <AvatarFallback className="text-xs text-white bg-primary">{m.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.displayName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role.toLowerCase()}</p>
                </div>
                {m.role !== "LEAD" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7"
                    onClick={() => handleRemoveMember(m)}
                  >
                    Retirer
                  </Button>
                )}
              </div>
            ))}
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

function TeamCard({ team, slug }: { readonly team: Team; readonly slug: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const deleteTeam = useTeamStore((s) => s.deleteTeam)

  async function handleDelete() {
    try {
      await deleteTeam(slug, team.id)
      toast.success("Équipe supprimée")
    } catch {
      toast.error("Erreur lors de la suppression")
    }
  }

  const lead = team.members.find((m) => m.role === "LEAD")

  return (
    <>
      <TeamSettingsSheet team={team} slug={slug} open={settingsOpen} onOpenChange={setSettingsOpen} />
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
            <DropdownMenuItem className="gap-2" onClick={() => setSettingsOpen(true)}>
              <Users className="size-4" /> Manage members
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
              Delete team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {team.members.slice(0, 5).map((m) => (
                <Avatar key={m.id} className="size-7 ring-2 ring-card">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                  <AvatarFallback className={cn("text-[9px] text-white font-semibold bg-primary")}>
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

          {lead && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Crown className="size-3 text-amber-400" />
              <span>{lead.displayName}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            {new Date(team.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamsPage() {
  const params = useParams<{ workspace: string }>()
  const slug = params.workspace

  const { teams, loading, error, fetchTeams } = useTeamStore()
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (slug) fetchTeams(slug)
  }, [slug, fetchTeams])

  const filtered = useMemo(() => {
    if (!search.trim()) return teams
    const q = search.toLowerCase()
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    )
  }, [search, teams])

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {teams.length} team{teams.length !== 1 && "s"} · Organize members by function or department
          </p>
        </div>
        <CreateTeamDialog slug={slug} />
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

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Chargement des équipes…
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-16 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Grid */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="size-10 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium text-foreground">
            {search ? "No teams found" : "No teams yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? "Try a different search term" : "Create your first team to get started"}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((team) => (
            <TeamCard key={team.id} team={team} slug={slug} />
          ))}
        </div>
      )}
    </div>
  )
}
