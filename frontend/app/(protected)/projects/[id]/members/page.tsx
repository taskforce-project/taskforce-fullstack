"use client"

import {
  UserPlus,
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type MemberRole = "owner" | "admin" | "member"

interface ProjectMember {
  id: string
  name: string
  email: string
  initials: string
  color: string
  role: MemberRole
  joinedAt: string
  issuesCount: number
  isYou?: boolean
}

const ROLE_CONFIG: Record<MemberRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  owner: {
    label: "Owner",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    icon: <Crown className="h-3 w-3 text-amber-400" />,
  },
  admin: {
    label: "Admin",
    badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    icon: <Shield className="h-3 w-3 text-violet-400" />,
  },
  member: {
    label: "Member",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: <User className="h-3 w-3 text-muted-foreground" />,
  },
}

const PROJECT_MEMBERS: ProjectMember[] = [
  {
    id: "1",
    name: "You",
    email: "you@taskforce.io",
    initials: "ME",
    color: "bg-primary",
    role: "owner",
    joinedAt: "Feb 10, 2026",
    issuesCount: 7,
    isYou: true,
  },
  {
    id: "2",
    name: "Sophie Martin",
    email: "sophie.martin@taskforce.io",
    initials: "SM",
    color: "bg-violet-500",
    role: "admin",
    joinedAt: "Feb 12, 2026",
    issuesCount: 5,
  },
  {
    id: "3",
    name: "Emma Petit",
    email: "emma.petit@taskforce.io",
    initials: "EP",
    color: "bg-emerald-500",
    role: "member",
    joinedAt: "Feb 18, 2026",
    issuesCount: 4,
  },
  {
    id: "4",
    name: "Thomas Bernard",
    email: "thomas.bernard@taskforce.io",
    initials: "TB",
    color: "bg-orange-500",
    role: "member",
    joinedAt: "Mar 3, 2026",
    issuesCount: 3,
  },
]

export default function ProjectMembersPage() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {PROJECT_MEMBERS.length} members
        </p>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          Invite member
        </Button>
      </div>

      {/* Members list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {PROJECT_MEMBERS.map((member) => {
          const role = ROLE_CONFIG[member.role]
          return (
            <div
              key={member.id}
              className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className={cn("text-xs text-white font-medium", member.color)}>
                  {member.initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {member.name}
                    {member.isYou && <span className="ml-1 text-xs text-muted-foreground font-normal">(you)</span>}
                  </span>
                  <Badge variant="outline" className={cn("text-xs border px-1.5 py-0 flex items-center gap-1", role.badgeClass)}>
                    {role.icon}
                    {role.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {member.email}
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
                <span className="text-xs font-medium text-foreground">{member.issuesCount}</span>
                <span className="text-xs text-muted-foreground">issues</span>
              </div>

              <div className="hidden md:block text-xs text-muted-foreground shrink-0 text-right">
                <div>Joined</div>
                <div className="font-medium text-foreground">{member.joinedAt}</div>
              </div>

              {!member.isYou && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Change role</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Remove from project</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
