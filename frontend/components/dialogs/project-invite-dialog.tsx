"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, Search, X, Loader2, Info } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserAvatar } from "@/components/ui/user-avatar"
import { searchUsers, type UserSearchResult } from "@/lib/api/user-service"
import { type ProjectRole } from "@/lib/api/project-service"
import { createInvitation } from "@/lib/api/invitation-service"
import { teamService, type Team } from "@/lib/api/team-service"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

interface ProjectInviteDialogProps {
  readonly workspace: string
  readonly projectId: number
  readonly onInvited: () => void
}

const NO_TEAM = "__none__"
const NEW_TEAM = "__new__"

const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: "MEMBER", label: "Member" },
  { value: "LEAD", label: "Lead" },
  { value: "VIEWER", label: "Viewer" },
]

/**
 * Invitation d'un membre dans un projet façon GitHub (PROD-3.4 — Slice 2).
 * Recherche dynamique → sélection → rôle projet. Si l'utilisateur n'est pas
 * encore dans le workspace, il y est **ajouté automatiquement** (prérequis back).
 * Option : ajouter l'invité à une équipe existante ou en créer une.
 */
export function ProjectInviteDialog({ workspace, projectId, onInvited }: ProjectInviteDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<UserSearchResult | null>(null)
  const [role, setRole] = useState<ProjectRole>("MEMBER")
  const [teams, setTeams] = useState<Team[]>([])
  const [teamChoice, setTeamChoice] = useState<string>(NO_TEAM)
  const [newTeamName, setNewTeamName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const wsMembers = useWorkspaceStore((s) => s.members)
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers)

  // Au montage du dialog : charger les équipes + s'assurer que les membres workspace sont connus
  useEffect(() => {
    if (!open) return
    teamService.list(workspace).then(setTeams).catch(() => setTeams([]))
    if (wsMembers.length === 0) fetchMembers().catch(() => {})
  }, [open, workspace, wsMembers.length, fetchMembers])

  // Recherche débouncée
  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const id = setTimeout(async () => {
      try {
        setResults(await searchUsers(query.trim()))
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [query, selected])

  const alreadyInWorkspace = selected ? wsMembers.some((m) => m.userId === selected.id) : true

  function reset() {
    setQuery(""); setResults([]); setSelected(null); setRole("MEMBER")
    setTeamChoice(NO_TEAM); setNewTeamName("")
  }

  async function handleSubmit() {
    if (!selected || submitting) return
    if (teamChoice === NEW_TEAM && !newTeamName.trim()) {
      toast.error("Team name required")
      return
    }
    setSubmitting(true)
    try {
      // Invitation PENDING ciblant le projet : la personne devra ACCEPTER (email + bannière in-app).
      // À l'acceptation, elle rejoint le workspace (si besoin) ET le projet, avec le rôle choisi.
      await createInvitation(workspace, { email: selected.email, role: "MEMBER", projectId, projectRole: role })
      // Équipe optionnelle (indépendante de l'acceptation du projet).
      if (teamChoice === NEW_TEAM) {
        const team = await teamService.create(workspace, { name: newTeamName.trim() })
        await teamService.addMember(workspace, team.id, { userId: selected.id })
      } else if (teamChoice !== NO_TEAM) {
        await teamService.addMember(workspace, Number(teamChoice), { userId: selected.id })
      }

      toast.success(`Invitation sent to ${selected.displayName ?? selected.email}`)
      onInvited()
      reset()
      setOpen(false)
    } catch (err) {
      // 409 = plafond du forfait Free sur un projet privé (façon GitHub) → upsell.
      const e = err as { response?: { status?: number; data?: { message?: string } } }
      if (e?.response?.status === 409) {
        toast.error(e.response?.data?.message ?? "Free plan limit reached on this private project.", {
          description: "Make the project public, or upgrade to a paid plan to invite without limits.",
          action: { label: "View plans", onClick: () => router.push(`/${workspace}/billing`) },
        })
      } else {
        toast.error("Error while inviting")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          Invite a member
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            Search for a Taskforce user, choose their role — they&apos;ll receive an invitation to accept.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Recherche / sélection */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-invite-search" className="text-sm font-medium">User</label>
            {selected ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
                <UserAvatar
                  email={selected.email}
                  name={selected.displayName ?? selected.email}
                  avatarUrl={selected.avatarUrl}
                  className="size-6"
                  fallbackClassName="text-[9px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{selected.displayName ?? selected.email}</p>
                  {selected.displayName && <p className="truncate text-xs text-muted-foreground">{selected.email}</p>}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => { setSelected(null); setQuery("") }}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="project-invite-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name or email…"
                  className="pl-9 h-9"
                  autoComplete="off"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                {results.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                    {results.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelected(u); setResults([]) }}
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-accent"
                      >
                        <UserAvatar
                          email={u.email}
                          name={u.displayName ?? u.email}
                          avatarUrl={u.avatarUrl}
                          className="size-6"
                          fallbackClassName="text-[9px]"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm">{u.displayName ?? u.email}</p>
                          {u.displayName && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">No matching Taskforce account.</p>
                )}
              </div>
            )}
          </div>

          {/* Notice : la personne doit ACCEPTER l'invitation avant de rejoindre. */}
          {selected && (
            <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-2 text-xs text-blue-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>They&apos;ll receive an invitation to this project{alreadyInWorkspace ? "" : " and the workspace"} and must accept it before joining.</span>
            </div>
          )}

          {/* Rôle projet */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Équipe optionnelle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Team <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Select value={teamChoice} onValueChange={setTeamChoice}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>No team</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.emoji} {t.name}</SelectItem>
                ))}
                <SelectItem value={NEW_TEAM}>＋ Create a team…</SelectItem>
              </SelectContent>
            </Select>
            {teamChoice === NEW_TEAM && (
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="New team name"
                className="h-9 mt-1"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!selected || submitting} className="gap-2">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
