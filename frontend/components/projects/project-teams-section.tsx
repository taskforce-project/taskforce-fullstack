"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, X, Users } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  listProjectTeams,
  attachProjectTeam,
  detachProjectTeam,
  type ProjectTeam,
} from "@/lib/api/project-service"
import { teamService, type Team } from "@/lib/api/team-service"

interface ProjectTeamsSectionProps {
  readonly workspace: string
  readonly projectId: number
}

/**
 * Gestion des équipes associées à un projet (PROD-3.6b).
 */
export function ProjectTeamsSection({ workspace, projectId }: ProjectTeamsSectionProps) {
  const [teams, setTeams] = useState<ProjectTeam[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<string>("")
  const [attaching, setAttaching] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([listProjectTeams(workspace, projectId), teamService.list(workspace)])
      .then(([linked, all]) => {
        if (!active) return
        setTeams(linked)
        setAllTeams(all)
      })
      .catch(() => { if (active) toast.error("Erreur lors du chargement des équipes") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [workspace, projectId])

  const available = useMemo(() => {
    const linkedIds = new Set(teams.map((t) => t.teamId))
    return allTeams.filter((t) => !linkedIds.has(t.id))
  }, [teams, allTeams])

  async function handleAttach() {
    const teamId = Number(selectedTeam)
    if (!teamId || attaching) return
    setAttaching(true)
    try {
      const linked = await attachProjectTeam(workspace, projectId, teamId)
      setTeams((prev) => [...prev, linked])
      setSelectedTeam("")
      toast.success(`Équipe « ${linked.name} » associée`)
    } catch {
      toast.error("Impossible d'associer cette équipe")
    } finally {
      setAttaching(false)
    }
  }

  async function handleCreateAndAttach() {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const team = await teamService.create(workspace, { name })
      const linked = await attachProjectTeam(workspace, projectId, team.id)
      setAllTeams((prev) => [...prev, team])
      setTeams((prev) => [...prev, linked])
      setNewName("")
      toast.success(`Équipe « ${team.name} » créée et associée`)
    } catch {
      toast.error("Impossible de créer l'équipe")
    } finally {
      setCreating(false)
    }
  }

  async function handleDetach(teamId: number, name: string) {
    try {
      await detachProjectTeam(workspace, projectId, teamId)
      setTeams((prev) => prev.filter((t) => t.teamId !== teamId))
      toast.success(`Équipe « ${name} » dissociée`)
    } catch {
      toast.error("Impossible de dissocier cette équipe")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
        <Users className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Équipes associées</span>
        <span className="text-xs text-muted-foreground">({teams.length})</span>
      </div>

      {/* Liste */}
      {teams.length > 0 ? (
        <div className="flex flex-wrap gap-2 p-4">
          {teams.map((t) => (
            <span
              key={t.teamId}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-2.5 pr-1.5 text-sm"
            >
              <span>{t.emoji}</span>
              <span>{t.name}</span>
              <span className="text-xs text-muted-foreground">· {t.memberCount}</span>
              <button
                type="button"
                onClick={() => handleDetach(t.teamId, t.name)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Dissocier ${t.name}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">Aucune équipe associée à ce projet.</p>
      )}

      {/* Associer */}
      {available.length > 0 && (
        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Associer une équipe…" /></SelectTrigger>
            <SelectContent>
              {available.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.emoji} {t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAttach} disabled={!selectedTeam || attaching} className="gap-1.5">
            {attaching && <Loader2 className="size-3.5 animate-spin" />}
            Associer
          </Button>
        </div>
      )}

      {/* Créer une nouvelle équipe (la gestion des équipes vit dans le projet — QA2-21) */}
      <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateAndAttach()}
          placeholder="Créer une nouvelle équipe…"
          className="h-9 flex-1"
        />
        <Button size="sm" variant="outline" onClick={handleCreateAndAttach} disabled={!newName.trim() || creating} className="gap-1.5">
          {creating && <Loader2 className="size-3.5 animate-spin" />}
          Créer
        </Button>
      </div>
    </div>
  )
}
