"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, X, Users, Plus, Trash2, ChevronDown, Crown, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import {
  listProjectTeams,
  attachProjectTeam,
  detachProjectTeam,
  type ProjectTeam,
} from "@/lib/api/project-service"
import { teamService, type Team } from "@/lib/api/team-service"
import { searchUsers, type UserSearchResult } from "@/lib/api/user-service"
import { ProjectInviteDialog } from "@/components/dialogs/project-invite-dialog"

interface ProjectTeamsSectionProps {
  readonly workspace: string
  readonly projectId: number
}

/**
 * Gestion complète des équipes depuis l'opération (QA3-7/QA3-12) :
 * créer une équipe, voir/ajouter/retirer ses membres, l'associer/dissocier du projet,
 * la supprimer. Tout se gère ici (plus de page Teams globale).
 */
export function ProjectTeamsSection({ workspace, projectId }: ProjectTeamsSectionProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [linkedIds, setLinkedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Recherche d'utilisateurs à ajouter (scopée à l'équipe dépliée)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])

  function reloadTeams() {
    return teamService.list(workspace).then(setTeams)
  }

  useEffect(() => {
    let active = true
    Promise.all([teamService.list(workspace), listProjectTeams(workspace, projectId)])
      .then(([all, linked]: [Team[], ProjectTeam[]]) => {
        if (!active) return
        setTeams(all)
        setLinkedIds(new Set(linked.map((t) => t.teamId)))
      })
      .catch(() => { if (active) toast.error("Erreur lors du chargement des équipes") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [workspace, projectId])

  // Recherche d'utilisateurs (déclenchée au changement de query)
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    let active = true
    searchUsers(query).then((r) => { if (active) setResults(r) }).catch(() => {})
    return () => { active = false }
  }, [query])

  async function handleCreate() {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const team = await teamService.create(workspace, { name })
      setTeams((prev) => [...prev, team])
      setNewName("")
      setExpanded(team.id)
      toast.success(`Équipe « ${team.name} » créée`)
    } catch {
      toast.error("Impossible de créer l'équipe")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(team: Team) {
    try {
      await teamService.delete(workspace, team.id)
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
      setLinkedIds((prev) => { const n = new Set(prev); n.delete(team.id); return n })
      toast.success(`Équipe « ${team.name} » supprimée`)
    } catch {
      toast.error("Impossible de supprimer l'équipe")
    }
  }

  async function toggleProject(team: Team) {
    const linked = linkedIds.has(team.id)
    try {
      if (linked) {
        await detachProjectTeam(workspace, projectId, team.id)
        setLinkedIds((prev) => { const n = new Set(prev); n.delete(team.id); return n })
      } else {
        await attachProjectTeam(workspace, projectId, team.id)
        setLinkedIds((prev) => new Set(prev).add(team.id))
      }
    } catch (err) {
      // 409 = plafond Free du projet privé (collaborateurs via équipe compris) → message clair + upsell.
      const e = err as { response?: { status?: number; data?: { message?: string } } }
      if (e?.response?.status === 409) {
        toast.error(e.response?.data?.message ?? "Limite de collaborateurs atteinte sur ce projet privé (forfait Free).", {
          description: "Rendez le projet public, ou passez à un forfait payant pour associer sans limite.",
        })
      } else {
        toast.error("Action impossible")
      }
    }
  }

  async function addMember(team: Team, user: UserSearchResult) {
    try {
      await teamService.addMember(workspace, team.id, { userId: user.id })
      const fresh = await teamService.get(workspace, team.id)
      setTeams((prev) => prev.map((t) => (t.id === team.id ? fresh : t)))
      setQuery("")
      setResults([])
      toast.success(`${user.displayName ?? user.email} ajouté à « ${team.name} »`)
    } catch {
      toast.error("Impossible d'ajouter ce membre")
    }
  }

  async function removeMember(team: Team, userId: number) {
    try {
      await teamService.removeMember(workspace, team.id, userId)
      setTeams((prev) => prev.map((t) =>
        t.id === team.id ? { ...t, members: t.members.filter((m) => m.userId !== userId) } : t
      ))
      toast.success("Membre retiré de l'équipe")
    } catch {
      toast.error("Impossible de retirer ce membre")
    }
  }

  const memberIdsOfExpanded = useMemo(() => {
    const t = teams.find((x) => x.id === expanded)
    return new Set(t?.members.map((m) => m.userId) ?? [])
  }, [teams, expanded])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Inviter de nouvelles personnes directement depuis les équipes (modale, sans changer de page) :
          email + rôle projet (Viewer inclus) + équipe optionnelle + ajout au workspace automatique. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Membres &amp; équipes</h3>
          <p className="text-xs text-muted-foreground">Invitez de nouvelles personnes ou regroupez-les en équipes, sans quitter l&apos;opération.</p>
        </div>
        <ProjectInviteDialog workspace={workspace} projectId={projectId} onInvited={() => { void reloadTeams() }} />
      </div>

      {/* Créer une équipe */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Users className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Créer une nouvelle équipe…"
          className="h-9 flex-1"
        />
        <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating} className="gap-1.5">
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Créer
        </Button>
      </div>

      {/* Liste des équipes */}
      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Users className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Aucune équipe</p>
            <p className="text-xs text-muted-foreground">Créez-en une ci-dessus pour regrouper des membres et l&apos;associer à l&apos;opération.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {teams.map((team) => {
            const isOpen   = expanded === team.id
            const isLinked = linkedIds.has(team.id)
            const extra    = team.members.length - 5
            return (
              <div
                key={team.id}
                className={cn(
                  "rounded-xl border bg-card overflow-hidden shadow-sm transition-colors",
                  isLinked ? "border-primary/30" : "border-border hover:border-foreground/15"
                )}
              >
                {/* En-tête équipe */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                    {team.emoji || "👥"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{team.name}</p>
                      {isLinked && (
                        <Badge variant="secondary" className="shrink-0 gap-1 border-primary/20 bg-primary/10 text-[10px] text-primary">
                          <span className="size-1.5 rounded-full bg-primary" /> Associée
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{team.members.length} membre{team.members.length !== 1 ? "s" : ""}</p>
                  </div>
                  {/* Avatars */}
                  <div className="hidden items-center sm:flex">
                    <div className="flex -space-x-2">
                      {team.members.slice(0, 5).map((m) => (
                        <UserAvatar key={m.userId} email={m.displayName} name={m.displayName} avatarUrl={m.avatarUrl} className="size-7 ring-2 ring-card" fallbackClassName="text-[9px]" />
                      ))}
                    </div>
                    {extra > 0 && (
                      <div className="ml-1 flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                        +{extra}
                      </div>
                    )}
                  </div>
                </div>

                {/* Barre d'actions */}
                <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2">
                  <Button
                    size="sm"
                    variant={isLinked ? "secondary" : "outline"}
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => toggleProject(team)}
                  >
                    {isLinked ? "Dissocier" : "Associer à l'opération"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => setExpanded(isOpen ? null : team.id)}
                  >
                    <Users className="size-3.5" /> Membres
                    <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => handleDelete(team)}
                    title="Supprimer l'équipe"
                    className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Membres (déplié) */}
                {isOpen && (
                  <div className="border-t border-border/60 bg-muted/10 px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {team.members.length === 0 ? (
                        <p className="py-1 text-xs text-muted-foreground">Aucun membre dans cette équipe.</p>
                      ) : team.members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-2.5 rounded-md px-1 py-1">
                          <UserAvatar email={m.displayName} name={m.displayName} avatarUrl={m.avatarUrl} className="size-6" fallbackClassName="text-[9px]" />
                          <span className="flex-1 truncate text-sm text-foreground">{m.displayName}</span>
                          {m.role === "LEAD" && <Badge variant="secondary" className="gap-1 text-[10px]"><Crown className="size-3 text-amber-500" /> Lead</Badge>}
                          <button
                            type="button"
                            onClick={() => removeMember(team, m.userId)}
                            title="Retirer de l'équipe"
                            className="rounded p-1 text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Ajouter / inviter un membre */}
                    <div className="relative mt-2">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={isOpen ? query : ""}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ajouter un membre (nom ou email)…"
                        className="h-8 pl-8 text-xs"
                      />
                      {query.trim() && results.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                          {results
                            .filter((u) => !memberIdsOfExpanded.has(u.id))
                            .slice(0, 6)
                            .map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => addMember(team, u)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60"
                              >
                                <UserPlus className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="flex-1 truncate">{u.displayName ?? u.email}</span>
                                <span className="truncate text-[10px] text-muted-foreground">{u.email}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
