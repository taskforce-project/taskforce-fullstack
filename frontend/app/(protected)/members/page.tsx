"use client"

import { useState, useMemo } from "react"
import {
  Search,
  UserPlus,
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
  Check,
  X,
  Clock,
  Filter,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemberRole = "owner" | "admin" | "member"
type MemberStatus = "active" | "pending"

interface WorkspaceMember {
  id: string
  name: string
  email: string
  initials: string
  color: string
  role: MemberRole
  status: MemberStatus
  joinedAt: string
  lastActive: string
  projectsCount: number
  issuesCount: number
  isYou?: boolean
}

type RoleFilter = "all" | MemberRole

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<MemberRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  owner: {
    label: "Owner",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    icon: <Crown className="size-3 text-amber-400" />,
  },
  admin: {
    label: "Admin",
    badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    icon: <Shield className="size-3 text-violet-400" />,
  },
  member: {
    label: "Member",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: <User className="size-3 text-muted-foreground" />,
  },
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const WORKSPACE_MEMBERS: WorkspaceMember[] = [
  {
    id: "1",
    name: "You",
    email: "you@taskforce.io",
    initials: "ME",
    color: "bg-primary",
    role: "owner",
    status: "active",
    joinedAt: "Feb 10, 2026",
    lastActive: "Just now",
    projectsCount: 4,
    issuesCount: 23,
    isYou: true,
  },
  {
    id: "2",
    name: "Sophie Martin",
    email: "sophie.martin@taskforce.io",
    initials: "SM",
    color: "bg-violet-500",
    role: "admin",
    status: "active",
    joinedAt: "Feb 12, 2026",
    lastActive: "2 hours ago",
    projectsCount: 3,
    issuesCount: 18,
  },
  {
    id: "3",
    name: "Emma Petit",
    email: "emma.petit@taskforce.io",
    initials: "EP",
    color: "bg-emerald-500",
    role: "member",
    status: "active",
    joinedAt: "Feb 18, 2026",
    lastActive: "Yesterday",
    projectsCount: 2,
    issuesCount: 11,
  },
  {
    id: "4",
    name: "Thomas Bernard",
    email: "thomas.bernard@taskforce.io",
    initials: "TB",
    color: "bg-orange-500",
    role: "member",
    status: "active",
    joinedAt: "Mar 3, 2026",
    lastActive: "3 days ago",
    projectsCount: 2,
    issuesCount: 7,
  },
  {
    id: "5",
    name: "Lucas Dufour",
    email: "lucas.dufour@taskforce.io",
    initials: "LD",
    color: "bg-blue-500",
    role: "member",
    status: "active",
    joinedAt: "Mar 15, 2026",
    lastActive: "Last week",
    projectsCount: 1,
    issuesCount: 5,
  },
  {
    id: "6",
    name: "Invited User",
    email: "invite@example.com",
    initials: "IU",
    color: "bg-muted-foreground",
    role: "member",
    status: "pending",
    joinedAt: "—",
    lastActive: "Pending",
    projectsCount: 0,
    issuesCount: 0,
  },
]

const ROLE_FILTER_TABS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "owner", label: "Owners" },
  { key: "admin", label: "Admins" },
  { key: "member", label: "Members" },
]

// ---------------------------------------------------------------------------
// InviteMemberDialog
// ---------------------------------------------------------------------------

function InviteMemberDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<MemberRole>("member")
  const [sent, setSent] = useState(false)

  function handleInvite() {
    if (!email.trim()) return
    setSent(true)
    setTimeout(() => {
      setSent(false)
      setEmail("")
      setRole("member")
      setOpen(false)
    }, 1500)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-9">
          <UserPlus className="size-4" />
          Invite member
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your workspace. They&apos;ll receive an email with a link to accept.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium text-foreground">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="pl-9 h-9"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Role</p>
            <div className="flex gap-2">
              {(["member", "admin"] as MemberRole[]).map((r) => {
                const cfg = ROLE_CONFIG[r]
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-all",
                      role === r
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/30"
                    )}
                  >
                    <span className="font-medium capitalize">{cfg.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {r === "member" ? "Can view & edit" : "Full access"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleInvite} disabled={!email.trim()} className="gap-2">
            {sent ? (
              <>
                <Check className="size-4" /> Sent!
              </>
            ) : (
              <>
                <Mail className="size-4" /> Send invitation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// MemberRow
// ---------------------------------------------------------------------------

function MemberRow({ member }: { readonly member: WorkspaceMember }) {
  const role = ROLE_CONFIG[member.role]

  return (
    <div className="group flex items-center gap-4 px-5 py-3.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="size-9">
          <AvatarFallback className={cn("text-xs text-white font-semibold", member.status === "pending" ? "bg-muted-foreground/40" : member.color)}>
            {member.initials}
          </AvatarFallback>
        </Avatar>
        {member.status === "active" && (
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-card" />
        )}
        {member.status === "pending" && (
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-card" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {member.name}
            {member.isYou && <span className="ml-1 text-xs text-muted-foreground font-normal">(you)</span>}
          </span>
          <Badge variant="outline" className={cn("text-xs border px-1.5 py-0 h-4 flex items-center gap-1", role.badgeClass)}>
            {role.icon}
            {role.label}
          </Badge>
          {member.status === "pending" && (
            <Badge variant="outline" className="text-xs border px-1.5 py-0 h-4 bg-amber-500/15 text-amber-400 border-amber-500/20 flex items-center gap-1">
              <Clock className="size-3" />
              Pending
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
          <Mail className="size-3" />
          {member.email}
        </div>
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-5 text-xs text-muted-foreground shrink-0">
        <div className="flex flex-col items-center">
          <span className="font-semibold text-foreground text-sm">{member.projectsCount}</span>
          <span>projects</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-semibold text-foreground text-sm">{member.issuesCount}</span>
          <span>issues</span>
        </div>
      </div>

      {/* Joined */}
      <div className="hidden lg:flex flex-col items-end gap-0.5 shrink-0 text-xs text-muted-foreground">
        <span>Joined {member.joinedAt}</span>
        <span className="text-muted-foreground/70">{member.lastActive}</span>
      </div>

      {/* Actions */}
      {!member.isYou && (
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
            <DropdownMenuItem>Change role</DropdownMenuItem>
            <DropdownMenuItem>View profile</DropdownMenuItem>
            {member.status === "pending" && (
              <DropdownMenuItem>Resend invitation</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              {member.status === "pending" ? "Cancel invitation" : "Remove from workspace"}
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

  const filtered = useMemo(() => {
    let list = WORKSPACE_MEMBERS
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [search, roleFilter])

  const activeCount = WORKSPACE_MEMBERS.filter((m) => m.status === "active").length
  const pendingCount = WORKSPACE_MEMBERS.filter((m) => m.status === "pending").length

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} active · {pendingCount} pending invitation{pendingCount !== 1 && "s"}
          </p>
        </div>
        <InviteMemberDialog />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Role filter tabs */}
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

        {/* Search */}
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
          <div className="hidden md:flex items-center gap-5">
            <span className="w-16 text-center">Projects</span>
            <span className="w-14 text-center">Issues</span>
          </div>
          <div className="hidden lg:block w-32 text-right">Joined</div>
          <div className="size-8 shrink-0" />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Filter className="size-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No members found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          filtered.map((member) => <MemberRow key={member.id} member={member} />)
        )}
      </div>

      {/* Plan info */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            {activeCount} / 5 members
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Free plan includes up to 5 members. Upgrade for unlimited.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(activeCount / 5) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{activeCount}/5</span>
        </div>
      </div>
    </div>
  )
}
