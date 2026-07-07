"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
  UserMinus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProjectInviteDialog } from "@/components/dialogs/project-invite-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { listProjectMembers, removeProjectMember } from "@/lib/api/project-service"
import type { ProjectMember, ProjectRole } from "@/lib/api/project-service"
import { useUserStore } from "@/lib/store/user-store"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<ProjectRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  LEAD: {
    label: "Lead",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    icon: <Crown className="h-3 w-3 text-amber-400" />,
  },
  MEMBER: {
    label: "Member",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: <User className="h-3 w-3 text-muted-foreground" />,
  },
  VIEWER: {
    label: "Viewer",
    badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    icon: <Shield className="h-3 w-3 text-violet-400" />,
  },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectMembersPage() {
  const params     = useParams()
  const workspace  = typeof params.workspace === "string" ? params.workspace : ""
  const projectId  = typeof params.id        === "string" ? Number(params.id)  : 0

  const { user } = useUserStore()

  const [members,   setMembers]   = useState<ProjectMember[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refreshMembers = useCallback(() => {
    if (!workspace || !projectId) return
    listProjectMembers(workspace, projectId)
      .then(setMembers)
      .catch(() => toast.error("Erreur lors du chargement des membres"))
  }, [workspace, projectId])

  useEffect(() => {
    if (!workspace || !projectId) return
    setIsLoading(true)
    listProjectMembers(workspace, projectId)
      .then(setMembers)
      .catch(() => toast.error("Erreur lors du chargement des membres"))
      .finally(() => setIsLoading(false))
  }, [workspace, projectId])

  const handleRemove = useCallback(async (memberId: number, memberEmail: string) => {
    try {
      await removeProjectMember(workspace, projectId, memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      toast.success(`${memberEmail} retiré du projet`)
    } catch {
      toast.error("Erreur lors de la suppression")
    }
  }, [workspace, projectId])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-0">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="size-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {members.length} membre{members.length === 1 ? "" : "s"}
        </p>
        <ProjectInviteDialog workspace={workspace} projectId={projectId} onInvited={refreshMembers} />
      </div>

      {/* Members list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {members.map((member) => {
          const isMe = user?.email === member.email
          const roleConf = ROLE_CONFIG[member.role]
          return (
            <div
              key={member.id}
              className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
            >
              <UserAvatar
                email={member.email}
                name={member.displayName ?? member.email}
                avatarUrl={member.avatarUrl}
                className="h-9 w-9"
                fallbackClassName="text-xs font-medium"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {member.displayName ?? member.email}
                    {isMe && <span className="ml-1 text-xs text-muted-foreground font-normal">(vous)</span>}
                  </span>
                  <Badge variant="outline" className={cn("text-xs border px-1.5 py-0 flex items-center gap-1", roleConf.badgeClass)}>
                    {roleConf.icon}
                    {roleConf.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {member.email}
                </div>
              </div>

              <div className="hidden md:block text-xs text-muted-foreground shrink-0 text-right">
                <div>Rejoint</div>
                <div className="font-medium text-foreground">{formatDate(member.joinedAt)}</div>
              </div>

              {!isMe && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Actions" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toast.info("Changement de rôle disponible prochainement")}>
                      Changer le rôle
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive [&_svg]:text-destructive"
                      onClick={() => handleRemove(member.id, member.email)}
                    >
                      <UserMinus className="size-4" />
                      Retirer du projet
                    </DropdownMenuItem>
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
