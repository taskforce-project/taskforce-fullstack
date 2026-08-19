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
      .catch(() => { if (active) toast.error("Failed to load teams") })
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
      toast.success(`Team "${team.name}" created`)
    } catch {
      toast.error("Could not create the team")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(team: Team) {
    try {
      await teamService.delete(workspace, team.id)
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
      setLinkedIds((prev) => { const n = new Set(prev); n.delete(team.id); return n })
      toast.success(`Team "${team.name}" deleted`)
    } catch {
      toast.error("Could not delete the team")
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
        toast.error(e.response?.data?.message ?? "Collaborator limit reached on this private project (Free plan).", {
          description: "Make the project public, or upgrade to a paid plan to link without limits.",
        })
      } else {
        toast.error("Action failed")
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
      toast.success(`${user.displayName ?? user.email} added to "${team.name}"`)
    } catch {
      toast.error("Could not add this member")
    }
  }

  async function removeMember(team: Team, userId: number) {
    try {
      await teamService.removeMember(workspace, team.id, userId)
      setTeams((prev) => prev.map((t) =>
        t.id === team.id ? { ...t, members: t.members.filter((m) => m.userId !== userId) } : t
      ))
      toast.success("Member removed from the team")
    } catch {
      toast.error("Could not remove this member")
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
          <h3 className="text-sm font-semibold text-foreground">Members &amp; teams</h3>
          <p className="text-xs text-muted-foreground">Invite new people or group them into teams, without leaving the operation.</p>
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
          placeholder="Create a new team…"
          className="h-9 flex-1"
        />
        <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating} className="gap-1.5">
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Create
        </Button>
      </div>

      {/* Liste des équipes */}
      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Users className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">No teams</p>
            <p className="text-xs text-muted-foreground">Create one above to group members and link it to the operation.</p>
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
                // Pas d'overflow-hidden : il clippait le dropdown de recherche de membres (absolute) sous
                // la card → invisible. On arrondit à la place les coins des bandes internes du bas.
                className={cn(
                  "rounded-xl border bg-card shadow-sm transition-colors",
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
                          <span className="size-1.5 rounded-full bg-primary" /> Linked
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
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
                <div className={cn("flex items-center gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2", !isOpen && "rounded-b-xl")}>
                  <Button
                    size="sm"
                    variant={isLinked ? "secondary" : "outline"}
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => toggleProject(team)}
                  >
                    {isLinked ? "Unlink" : "Link to operation"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => setExpanded(isOpen ? null : team.id)}
                  >
                    <Users className="size-3.5" /> Members
                    <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => handleDelete(team)}
                    title="Delete team"
                    className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Membres (déplié) */}
                {isOpen && (
                  <div className="border-t border-border/60 bg-muted/10 px-4 py-3 rounded-b-xl">
                    <div className="flex flex-col gap-1.5">
                      {team.members.length === 0 ? (
                        <p className="py-1 text-xs text-muted-foreground">No members in this team.</p>
                      ) : team.members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-2.5 rounded-md px-1 py-1">
                          <UserAvatar email={m.displayName} name={m.displayName} avatarUrl={m.avatarUrl} className="size-6" fallbackClassName="text-[9px]" />
                          <span className="flex-1 truncate text-sm text-foreground">{m.displayName}</span>
                          {m.role === "LEAD" && <Badge variant="secondary" className="gap-1 text-[10px]"><Crown className="size-3 text-amber-500" /> Lead</Badge>}
                          <button
                            type="button"
                            onClick={() => removeMember(team, m.userId)}
                            title="Remove from team"
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
                        placeholder="Add a member (name or email)…"
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
