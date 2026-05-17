"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  UserPlus,
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { toast } from "sonner"
import { listProjectMembers, addProjectMember, removeProjectMember } from "@/lib/api/project-service"
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

const AVATAR_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-cyan-500","bg-amber-500","bg-indigo-500"]

function memberInitials(m: ProjectMember): string {
  if (m.displayName) {
    const parts = m.displayName.trim().split(" ")
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return m.displayName.slice(0, 2).toUpperCase()
  }
  return m.email.slice(0, 2).toUpperCase()
}

function memberColor(m: ProjectMember): string {
  return AVATAR_COLORS[m.userId % AVATAR_COLORS.length]
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
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [isInviting, setIsInviting] = useState(false)

  useEffect(() => {
    if (!workspace || !projectId) return
    setIsLoading(true)
    listProjectMembers(workspace, projectId)
      .then(setMembers)
      .catch(() => toast.error("Erreur lors du chargement des membres"))
      .finally(() => setIsLoading(false))
  }, [workspace, projectId])

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return
    setIsInviting(true)
    try {
      await addProjectMember(workspace, projectId, { email: inviteEmail.trim(), role: "MEMBER" })
      const updated = await listProjectMembers(workspace, projectId)
      setMembers(updated)
      toast.success("Membre invité")
      setInviteEmail("")
      setInviteOpen(false)
    } catch {
      toast.error("Erreur lors de l'invitation")
    } finally {
      setIsInviting(false)
    }
  }, [workspace, projectId, inviteEmail])

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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {members.length} membre{members.length === 1 ? "" : "s"}
        </p>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-8 text-xs">
              <UserPlus className="h-3.5 w-3.5" />
              Inviter un membre
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un membre</DialogTitle>
              <DialogDescription>Entrez l&apos;email du membre à inviter au projet.</DialogDescription>
            </DialogHeader>
            <Input
              placeholder="email@example.com"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setInviteOpen(false); setInviteEmail("") }}>Annuler</Button>
              <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>
                {isInviting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Inviter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <Avatar className="h-9 w-9">
                <AvatarFallback className={cn("text-xs text-white font-medium", memberColor(member))}>
                  {memberInitials(member)}
                </AvatarFallback>
              </Avatar>

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
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toast.info("Changement de rôle disponible prochainement")}>
                      Changer le rôle
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleRemove(member.id, member.email)}
                    >
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
