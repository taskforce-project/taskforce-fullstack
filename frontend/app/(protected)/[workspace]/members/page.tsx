"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Search,
  UserPlus,
  UserMinus,
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
  X,
  Layers,
  Loader2,
  Sparkles,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/layout/page-shell"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import Link from "next/link"
import { cn } from "@/lib/utils"
import { planLimit } from "@/lib/config/plan-limits"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useUserStore } from "@/lib/store/user-store"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchUsers, type UserSearchResult } from "@/lib/api/user-service"
import { getWorkspaceUsage, type WorkspaceMember, type WorkspaceRole, type WorkspaceUsage } from "@/lib/api/workspace-service"
import {
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
  type Invitation,
} from "@/lib/api/invitation-service"
import { listSkillProfiles, type MemberSkillProfile } from "@/lib/api/skill-service"
import { RedistributionDialog } from "@/components/dialogs/redistribution-dialog"

const SENIORITY_LABEL: Record<string, string> = {
  JUNIOR: "Junior", MID: "Mid", SENIOR: "Senior", LEAD: "Lead",
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type RoleFilter = "all" | WorkspaceRole

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  OWNER: {
    label: "Owner",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    icon: <Crown className="size-3 text-amber-400" />,
  },
  ADMIN: {
    label: "Admin",
    badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    icon: <Shield className="size-3 text-violet-400" />,
  },
  MEMBER: {
    label: "Member",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: <User className="size-3 text-muted-foreground" />,
  },
}

const ROLE_FILTER_TABS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "OWNER", label: "Owners" },
  { key: "ADMIN", label: "Admins" },
  { key: "MEMBER", label: "Members" },
]

/** Ordre de tri des rôles (OWNER en tête). */
const ROLE_RANK: Record<WorkspaceRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 }

// ---------------------------------------------------------------------------
// InviteMemberDialog
// ---------------------------------------------------------------------------

function InviteMemberDialog({ onInvited }: { readonly onInvited?: () => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [role, setRole] = useState<WorkspaceRole>("MEMBER")
  const [loading, setLoading] = useState(false)
  const [emailInviting, setEmailInviting] = useState(false)
  const invite = useWorkspaceStore((s) => s.invite)
  const existingMembers = useWorkspaceStore((s) => s.members)
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)

  // Recherche débouncée (par email ou nom)
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const id = setTimeout(async () => {
      try {
        const found = await searchUsers(query.trim())
        const memberIds = new Set(existingMembers.map((m) => m.userId))
        const selectedIds = new Set(selectedUsers.map((u) => u.id))
        setResults(found.filter((u) => !memberIds.has(u.id) && !selectedIds.has(u.id)))
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [query, selectedUsers, existingMembers])

  function reset() {
    setQuery(""); setResults([]); setSelectedUsers([]); setRole("MEMBER")
  }

  function addUser(u: UserSearchResult) {
    setSelectedUsers((prev) => prev.some((p) => p.id === u.id) ? prev : [...prev, u])
    setQuery("")
    setResults([])
  }

  function removeUser(id: number) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id))
  }

  async function handleInviteByEmail() {
    const email = query.trim().toLowerCase()
    if (!slug || !EMAIL_RE.test(email) || emailInviting) return
    setEmailInviting(true)
    try {
      await createInvitation(slug, { email, role })
      toast.success(`Invitation sent to ${email}`)
      setQuery("")
      setResults([])
      onInvited?.()
    } catch {
      toast.error("Could not send the invitation")
    } finally {
      setEmailInviting(false)
    }
  }

  async function handleInvite() {
    if (selectedUsers.length === 0) return
    setLoading(true)
    const results = await Promise.all(selectedUsers.map((u) => invite({ email: u.email, role })))
    setLoading(false)

    const added = results.filter(Boolean).length
    const failed = selectedUsers.length - added
    if (added > 0) {
      toast.success(added === 1 ? "1 member added to the workspace" : `${added} members added to the workspace`)
    }
    if (failed > 0) {
      toast.error(failed === 1
        ? "1 invitation failed (Taskforce account not found)."
        : `${failed} invitations failed (Taskforce accounts not found).`)
    }
    if (added > 0) {
      reset()
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-9">
          <UserPlus className="size-4" />
          Invite member
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Search an existing Taskforce user by name or email and pick their role.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Recherche utilisateur */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-search" className="text-sm font-medium">Users</label>

            {/* Chips des utilisateurs sélectionnés */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-1 pr-1.5 text-xs"
                  >
                    <UserAvatar
                      email={u.email}
                      name={u.displayName ?? u.email}
                      avatarUrl={u.avatarUrl}
                      className="size-5"
                      fallbackClassName="text-[8px]"
                    />
                    <span className="max-w-[140px] truncate">{u.displayName ?? u.email}</span>
                    <button type="button" onClick={() => removeUser(u.id)} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-search"
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
                      onClick={() => addUser(u)}
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
                EMAIL_RE.test(query.trim()) ? (
                  <button
                    type="button"
                    onClick={handleInviteByEmail}
                    disabled={emailInviting}
                    className="mt-1.5 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
                  >
                    {emailInviting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4 text-muted-foreground" />}
                    <span>No account — invite <strong>{query.trim()}</strong> by email</span>
                  </button>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">No account matches. Enter a full email to invite someone without an account.</p>
                )
              )}
            </div>
          </div>

          {/* Rôle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
              {/* Le <label> voisin n'est pas associé au contrôle (pas de `htmlFor`) : sans
                  `aria-label`, ce sélecteur reste anonyme malgré son intitulé visible. */}
              <SelectTrigger className="h-9" aria-label="Invited member role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleInvite} disabled={selectedUsers.length === 0 || loading} className="gap-2">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {selectedUsers.length > 1 ? `Add ${selectedUsers.length} members` : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// MemberActions — menu d'une ligne membre (promote / demote / remove)
// ---------------------------------------------------------------------------

interface MemberActionsProps {
  readonly member: WorkspaceMember
  readonly isYou: boolean
  readonly canManage: boolean
  readonly isOwner: boolean
}

/** Rien si la ligne n'est pas gérable (soi-même, non-manager, ou cible OWNER). */
function MemberActions({ member, isYou, canManage, isOwner }: MemberActionsProps) {
  const changeRole = useWorkspaceStore((s) => s.changeRole)
  const kick = useWorkspaceStore((s) => s.kick)

  async function handleChangeRole(newRole: WorkspaceRole) {
    const result = await changeRole(member.id, { role: newRole })
    if (result) toast.success("Role updated")
    else toast.error("Could not change the role")
  }

  async function handleRemove() {
    try {
      await kick(member.id)
      toast.success("Member removed from the workspace")
    } catch {
      toast.error("Could not remove this member")
    }
  }

  if (isYou || !canManage || member.role === "OWNER") return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${member.displayName ?? member.email}`}
          className="size-8 shrink-0 text-muted-foreground"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isOwner && member.role !== "ADMIN" && (
          <DropdownMenuItem onClick={() => handleChangeRole("ADMIN")}>
            Promote to Admin
          </DropdownMenuItem>
        )}
        {isOwner && member.role === "ADMIN" && (
          <DropdownMenuItem onClick={() => handleChangeRole("MEMBER")}>
            Demote to Member
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive [&_svg]:text-destructive"
          onClick={handleRemove}
        >
          <UserMinus className="size-4" />
          Remove from workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PendingInvitations (PROD-3.5)
// ---------------------------------------------------------------------------

function PendingInvitations({ slug, refreshKey }: { readonly slug: string; readonly refreshKey: number }) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    listPendingInvitations(slug)
      .then((list) => { if (active) setInvitations(list) })
      .catch(() => { if (active) setInvitations([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug, refreshKey])

  async function handleRevoke(id: number) {
    try {
      await revokeInvitation(slug, id)
      setInvitations((prev) => prev.filter((i) => i.id !== id))
      toast.success("Invitation revoked")
    } catch {
      toast.error("Could not revoke the invitation")
    }
  }

  if (loading || invitations.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-2.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
        Pending invitations ({invitations.length})
      </div>
      {invitations.map((inv) => (
        <div key={inv.id} className="flex items-center gap-4 px-5 py-3 border-b border-border/50 last:border-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Mail className="size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
            <p className="text-xs text-muted-foreground">
              {inv.role} · invited {inv.invitedByName ? `by ${inv.invitedByName}` : ""}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">Pending</Badge>
          <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)} className="text-destructive">
            Revoke
          </Button>
        </div>
      ))}
    </div>
  )
}

export default function MembersPage() {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [projectFilter, setProjectFilter] = useState<string>("all")
  const [invitationRefresh, setInvitationRefresh] = useState(0)
  const [profilesByUser, setProfilesByUser] = useState<Record<number, MemberSkillProfile>>({})
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null)

  const { members, membersLoading, fetchMembers, workspace } = useWorkspaceStore()
  const { projects, fetchProjects } = useProjectStore()
  const currentUser = useUserStore((s) => s.user)
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Projets (incluent leurs membres) → savoir qui est dans quel projet + filtre (QA2-20)
  useEffect(() => {
    if (workspace?.slug) fetchProjects(workspace.slug)
  }, [workspace?.slug, fetchProjects])

  const projectsByUser = useMemo(() => {
    const map = new Map<number, { id: number; name: string }[]>()
    for (const p of projects) {
      for (const m of p.members ?? []) {
        const arr = map.get(m.userId) ?? []
        arr.push({ id: p.id, name: p.name })
        map.set(m.userId, arr)
      }
    }
    return map
  }, [projects])

  // Profils de compétences (aperçu sur la liste — PROD-1.2/1.8)
  useEffect(() => {
    const slug = workspace?.slug
    if (!slug) return
    let active = true
    listSkillProfiles(slug)
      .then((profiles) => {
        if (!active) return
        setProfilesByUser(Object.fromEntries(profiles.map((p) => [p.userId, p])))
      })
      .catch(() => { /* non bloquant */ })
    getWorkspaceUsage(slug)
      .then((u) => { if (active) setUsage(u) })
      .catch(() => { /* non bloquant — fallback plan-limits.ts */ })
    return () => { active = false }
  }, [workspace?.slug])

  // NB : `currentUser.id` est typé `string` mais l'API /users/me le sérialise en `number`.
  // On compare donc les deux bords en String (sinon `"1" === 1` → false → canManage jamais vrai).
  const currentMember = members.find((m) => String(m.userId) === String(currentUser?.id))
  const canManage = currentMember?.role === "OWNER" || currentMember?.role === "ADMIN"
  const isOwner = currentMember?.role === "OWNER"

  const filtered = useMemo(() => {
    let list = members
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter)
    if (projectFilter !== "all") {
      const pid = Number(projectFilter)
      const ids = new Set((projects.find((p) => p.id === pid)?.members ?? []).map((m) => m.userId))
      list = list.filter((m) => ids.has(m.userId))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          (m.displayName ?? "").toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [members, search, roleFilter, projectFilter, projects])

  const slug = workspace?.slug

  // Colonnes du DataTable partagé (même DA que Signals / My Queue) : tri + pagination gérés dedans.
  const columns: DataTableColumn<WorkspaceMember>[] = [
    {
      key: "member",
      header: "Member",
      icon: <User className="size-3.5" />,
      className: "min-w-[200px]",
      sortValue: (m) => (m.displayName ?? m.email).toLowerCase(),
      render: (m) => {
        const profile = profilesByUser[m.userId]
        const isYou = String(m.userId) === String(currentUser?.id)
        const label = m.displayName ?? m.email
        return (
          <div className="flex items-center gap-3">
            <UserAvatar email={m.email} name={label} avatarUrl={m.avatarUrl} className="size-8" fallbackClassName="text-xs font-semibold" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {slug ? (
                  <Link href={`/${slug}/members/${m.id}`} className="truncate text-sm font-medium text-foreground hover:underline">{label}</Link>
                ) : (
                  <span className="truncate text-sm font-medium text-foreground">{label}</span>
                )}
                {isYou && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
              </div>
              {profile?.seniority && (
                <span className="text-xs text-muted-foreground">{SENIORITY_LABEL[profile.seniority] ?? profile.seniority}</span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: "role",
      header: "Role",
      icon: <Shield className="size-3.5" />,
      className: "w-32",
      sortValue: (m) => ROLE_RANK[m.role],
      render: (m) => {
        const role = ROLE_CONFIG[m.role]
        return (
          <Badge variant="outline" className={cn("inline-flex h-5 items-center gap-1 border px-1.5 py-0 text-xs", role.badgeClass)}>
            {role.icon}
            {role.label}
          </Badge>
        )
      },
    },
    {
      key: "email",
      header: "Email",
      icon: <Mail className="size-3.5" />,
      className: "hidden md:table-cell",
      sortValue: (m) => m.email.toLowerCase(),
      render: (m) => <span className="text-xs text-muted-foreground">{m.email}</span>,
    },
    {
      key: "skills",
      header: "Skills",
      icon: <Sparkles className="size-3.5" />,
      className: "hidden xl:table-cell",
      render: (m) => {
        const profile = profilesByUser[m.userId]
        if (!profile || profile.skills.length === 0) return <span className="text-[10px] text-muted-foreground/40">—</span>
        return (
          <div className="flex flex-wrap items-center gap-1">
            {profile.skills.slice(0, 3).map((s) => (
              <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{s}</span>
            ))}
            {profile.skills.length > 3 && <span className="text-[10px] text-muted-foreground">+{profile.skills.length - 3}</span>}
          </div>
        )
      },
    },
    {
      key: "projects",
      header: "Projects",
      icon: <Layers className="size-3.5" />,
      className: "hidden xl:table-cell",
      render: (m) => {
        const list = projectsByUser.get(m.userId) ?? []
        if (list.length === 0) return <span className="text-[10px] text-muted-foreground/40">—</span>
        return (
          <div className="flex flex-wrap items-center gap-1">
            {list.slice(0, 2).map((p) => (
              <span key={p.id} className="max-w-[90px] truncate rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.name}</span>
            ))}
            {list.length > 2 && <span className="text-[10px] text-muted-foreground">+{list.length - 2}</span>}
          </div>
        )
      },
    },
    {
      key: "joined",
      header: "Joined",
      icon: <CalendarDays className="size-3.5" />,
      align: "right",
      className: "hidden lg:table-cell w-32",
      sortValue: (m) => new Date(m.joinedAt).getTime(),
      render: (m) => (
        <span className="text-xs text-muted-foreground">
          {new Date(m.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      render: (m) => (
        <MemberActions
          member={m}
          isYou={String(m.userId) === String(currentUser?.id)}
          canManage={canManage}
          isOwner={isOwner}
        />
      ),
    },
  ]

  const memberCount = members.length
  const memberSuffix = memberCount === 1 ? "" : "s"
  const memberCountLabel = membersLoading ? "Loading…" : `${memberCount} member${memberSuffix}`

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {memberCountLabel}
          </p>
        </div>
        {canManage && (() => {
          // Source de vérité = endpoint usage back (PROD-4.2) ; fallback plan-limits.ts si non chargé.
          const used = usage?.membersUsed ?? members.length
          const rawLimit = usage ? usage.membersLimit : planLimit(currentUser?.planType, "members")
          const unlimited = rawLimit === -1 || !Number.isFinite(rawLimit)
          const atLimit = !unlimited && used >= rawLimit
          return (
            <div className="flex flex-col items-end gap-1.5">
              {!unlimited && (
                <span className={cn("text-xs", atLimit ? "text-amber-500 font-medium" : "text-muted-foreground")}>
                  {used}/{rawLimit} members
                </span>
              )}
              {atLimit ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openUpgrade()}>
                  <Crown className="size-3.5 text-amber-500" /> Upgrade plan
                </Button>
              ) : (
                <InviteMemberDialog onInvited={() => setInvitationRefresh((n) => n + 1)} />
              )}
            </div>
          )
        })()}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center rounded-lg bg-muted p-1 gap-0.5">
          {ROLE_FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRoleFilter(tab.key)}
              className={cn(
                "px-3 py-1 text-sm rounded-md transition-all font-medium",
                roleFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
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

        {/* Filtre par projet (QA2-20) */}
        {projects.length > 0 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            {/* Le nom accessible ne doit pas dépendre de la valeur affichée : selon la sélection,
                `SelectValue` peut ne rendre aucun texte et le bouton devient anonyme pour un
                lecteur d'écran (axe : `button-name`, critique). */}
            <SelectTrigger className="h-9 w-44 text-sm shrink-0" aria-label="Filter by project"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Redistribution de charge (PROD-1.12) — manager only */}
        {canManage && workspace?.slug && (
          <div className="ml-auto shrink-0">
            <RedistributionDialog slug={workspace.slug} onApplied={() => fetchMembers()} />
          </div>
        )}
      </div>

      {/* Members list — DataTable partagé (tri par colonne, pagination, styles homogènes avec Signals). */}
      {membersLoading && members.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/50 px-5 py-4 last:border-0">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="hidden h-4 w-24 lg:block" />
              <Skeleton className="size-8 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(m) => m.id}
          pageSize={25}
          emptyMessage="No members found. Try adjusting your search or filter."
        />
      )}

      {/* Invitations en attente (PROD-3.5) */}
      {canManage && workspace?.slug && (
        <PendingInvitations slug={workspace.slug} refreshKey={invitationRefresh} />
      )}

      {/* Plan info — limite réelle selon le plan (QA2-20 : plus de « /5 » codé en dur) */}
      {workspace && (() => {
        const rawLimit = usage ? usage.membersLimit : planLimit(currentUser?.planType, "members")
        const unlimited = rawLimit === -1 || !Number.isFinite(rawLimit)
        const planLabel =
          currentUser?.planType === "ENTERPRISE" ? "Enterprise"
          : currentUser?.planType === "BUSINESS" ? "Business"
          : currentUser?.planType === "BASIC" ? "Basic"
          : "Free"
        const atLimit = !unlimited && memberCount >= rawLimit
        return (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {memberCount} member{memberCount === 1 ? "" : "s"} in <span className="font-semibold">{workspace.name}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unlimited
                  ? `${planLabel} plan — unlimited members.`
                  : `${planLabel} plan — up to ${rawLimit} members.${atLimit ? " Limit reached." : ""}`}
              </p>
            </div>
            {unlimited ? (
              <Badge variant="secondary" className="gap-1.5 shrink-0">
                <Crown className="size-3.5 text-amber-500" /> {planLabel}
              </Badge>
            ) : (
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", atLimit ? "bg-amber-500" : "bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300")}
                      style={{ width: `${Math.min((memberCount / rawLimit) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{memberCount}/{rawLimit}</span>
                </div>
                {atLimit && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openUpgrade()}>
                    <Crown className="size-3.5 text-amber-500" /> Upgrade
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })()}
    </PageContainer>
  )
}
