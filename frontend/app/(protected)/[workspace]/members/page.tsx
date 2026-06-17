"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Search,
  UserPlus,
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
  X,
  Filter,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
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
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useUserStore } from "@/lib/store/user-store"
import { searchUsers, type UserSearchResult } from "@/lib/api/user-service"
import type { WorkspaceMember, WorkspaceRole } from "@/lib/api/workspace-service"

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

// ---------------------------------------------------------------------------
// InviteMemberDialog
// ---------------------------------------------------------------------------

function InviteMemberDialog() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<UserSearchResult | null>(null)
  const [role, setRole] = useState<WorkspaceRole>("MEMBER")
  const [loading, setLoading] = useState(false)
  const invite = useWorkspaceStore((s) => s.invite)
  const existingMembers = useWorkspaceStore((s) => s.members)

  // Recherche débouncée (par email ou nom)
  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const id = setTimeout(async () => {
      try {
        const found = await searchUsers(query.trim())
        const memberIds = new Set(existingMembers.map((m) => m.userId))
        setResults(found.filter((u) => !memberIds.has(u.id)))
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [query, selected, existingMembers])

  function reset() {
    setQuery(""); setResults([]); setSelected(null); setRole("MEMBER")
  }

  async function handleInvite() {
    const email = selected?.email ?? query.trim()
    if (!email) return
    setLoading(true)
    const result = await invite({ email, role })
    setLoading(false)
    if (result) {
      toast.success(`${selected?.displayName ?? email} ajouté au workspace`)
      reset()
      setOpen(false)
    } else {
      toast.error("Impossible d'inviter ce membre. L'email doit correspondre à un compte Taskforce existant.")
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
            <label htmlFor="invite-search" className="text-sm font-medium">User</label>
            {selected ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
                <Avatar className="size-6">
                  <AvatarImage src={selected.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[9px]">{selected.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
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
                        onClick={() => { setSelected(u); setResults([]) }}
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-accent"
                      >
                        <Avatar className="size-6">
                          <AvatarImage src={u.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[9px]">{u.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm">{u.displayName ?? u.email}</p>
                          {u.displayName && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">No existing user matches — invitations for new emails are coming soon.</p>
                )}
              </div>
            )}
          </div>

          {/* Rôle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleInvite} disabled={!selected || loading} className="gap-2">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// MemberRow
// ---------------------------------------------------------------------------

interface MemberRowProps {
  readonly member: WorkspaceMember
  readonly isYou: boolean
  readonly canManage: boolean
  readonly isOwner: boolean
}

function MemberRow({ member, isYou, canManage, isOwner }: MemberRowProps) {
  const role = ROLE_CONFIG[member.role]
  const changeRole = useWorkspaceStore((s) => s.changeRole)
  const kick = useWorkspaceStore((s) => s.kick)

  const displayLabel = member.displayName ?? member.email
  const isEmail = !member.displayName
  let initials: string
  if (isEmail) {
    // fallback email : utiliser les 2 premiers chars de la partie locale
    const localPart = member.email.split("@")[0] ?? ""
    initials = localPart.slice(0, 2).toUpperCase() || "?"
  } else {
    const nameParts = displayLabel.split(" ")
    initials = `${nameParts[0]?.charAt(0) ?? ""}${nameParts[1]?.charAt(0) ?? ""}`.toUpperCase() || "?"
  }
  const avatarSrc = member.avatarUrl ?? `/api/avatar?initials=${encodeURIComponent(initials)}&seed=${encodeURIComponent(member.email.toLowerCase())}`

  async function handleChangeRole(newRole: WorkspaceRole) {
    const result = await changeRole(member.id, { role: newRole })
    if (result) toast.success("Rôle mis à jour")
    else toast.error("Impossible de changer le rôle")
  }

  async function handleRemove() {
    try {
      await kick(member.id)
      toast.success("Membre retiré du workspace")
    } catch {
      toast.error("Impossible de retirer ce membre")
    }
  }

  const joinedDate = new Date(member.joinedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return (
    <div className="group flex items-center gap-4 px-5 py-3.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="size-9">
          <AvatarImage src={avatarSrc} alt={displayLabel} />
          <AvatarFallback className="text-xs font-semibold">
            {displayLabel.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-card" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {displayLabel}
            {isYou && <span className="ml-1 text-xs text-muted-foreground font-normal">(you)</span>}
          </span>
          <Badge variant="outline" className={cn("text-xs border px-1.5 py-0 h-4 flex items-center gap-1", role.badgeClass)}>
            {role.icon}
            {role.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
          <Mail className="size-3" />
          {member.email}
        </div>
      </div>

      {/* Joined */}
      <div className="hidden lg:flex flex-col items-end gap-0.5 shrink-0 text-xs text-muted-foreground">
        <span>Joined {joinedDate}</span>
      </div>

      {/* Actions — only shown if current user can manage and target is not OWNER */}
      {!isYou && canManage && member.role !== "OWNER" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Only OWNER can change roles */}
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
              className="text-destructive focus:text-destructive"
              onClick={handleRemove}
            >
              Remove from workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MembersPage() {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")

  const { members, membersLoading, fetchMembers, workspace } = useWorkspaceStore()
  const currentUser = useUserStore((s) => s.user)

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const currentMember = members.find((m) => String(m.userId) === currentUser?.id)
  const canManage = currentMember?.role === "OWNER" || currentMember?.role === "ADMIN"
  const isOwner = currentMember?.role === "OWNER"

  const filtered = useMemo(() => {
    let list = members
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          (m.displayName ?? "").toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [members, search, roleFilter])

  const memberCount = members.length
  const memberSuffix = memberCount === 1 ? "" : "s"
  const memberCountLabel = membersLoading ? "Loading…" : `${memberCount} member${memberSuffix}`

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {memberCountLabel}
          </p>
        </div>
        {canManage && <InviteMemberDialog />}
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
      </div>

      {/* Members list */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
          <div className="size-9 shrink-0" />
          <div className="flex-1">Member</div>
          <div className="hidden lg:block w-32 text-right">Joined</div>
          <div className="size-8 shrink-0" />
        </div>

        {membersLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!membersLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Filter className="size-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No members found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter</p>
          </div>
        )}
        {!membersLoading && filtered.length > 0 && filtered.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
              isYou={String(member.userId) === currentUser?.id}
            canManage={canManage}
            isOwner={isOwner}
          />
        ))}
      </div>

      {/* Plan info */}
      {workspace && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {memberCount} member{memberCount === 1 ? "" : "s"} in <span className="font-semibold">{workspace.name}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Free plan includes up to 5 members. Upgrade for unlimited.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min((memberCount / 5) * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{memberCount}/5</span>
          </div>
        </div>
      )}
    </div>
  )
}
