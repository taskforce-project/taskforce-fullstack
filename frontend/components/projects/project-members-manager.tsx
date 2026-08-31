"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Mail,
  UserMinus,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  LEAD:   { label: "Lead",   badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",   icon: <Crown className="h-3 w-3 text-amber-400" /> },
  MEMBER: { label: "Member", badgeClass: "bg-muted text-muted-foreground border-border",         icon: <User className="h-3 w-3 text-muted-foreground" /> },
  VIEWER: { label: "Viewer", badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20", icon: <Shield className="h-3 w-3 text-violet-400" /> },
}

/** Au-delà de ce seuil, la liste est paginée (« si y a masse monde »). */
const PAGE_SIZE = 8

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Gestion des membres d'un projet - inviter / lister / retirer, avec recherche
// et pagination. Utilisé dans « Réglages › Membres » (et sur la route /members
// conservée pour les liens profonds). Source unique pour éviter la divergence.
// ---------------------------------------------------------------------------

export function ProjectMembersManager({
  workspace,
  projectId,
}: {
  readonly workspace: string
  readonly projectId: number
}) {
  const { user } = useUserStore()

  const [members,   setMembers]   = useState<ProjectMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query,     setQuery]     = useState("")
  const [page,      setPage]      = useState(0)

  const refreshMembers = useCallback(() => {
    if (!workspace || !projectId) return
    listProjectMembers(workspace, projectId)
      .then(setMembers)
      .catch(() => toast.error("Failed to load members"))
  }, [workspace, projectId])

  useEffect(() => {
    if (!workspace || !projectId) return
    setIsLoading(true)
    listProjectMembers(workspace, projectId)
      .then(setMembers)
      .catch(() => toast.error("Failed to load members"))
      .finally(() => setIsLoading(false))
  }, [workspace, projectId])

  const handleRemove = useCallback(async (memberId: number, memberEmail: string) => {
    try {
      await removeProjectMember(workspace, projectId, memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      toast.success(`${memberEmail} removed from the project`)
    } catch {
      toast.error("Failed to remove member")
    }
  }, [workspace, projectId])

  // Filtre nom/email, insensible à la casse.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) => (m.displayName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    )
  }, [members, query])

  // On borne la page au nombre de pages dispo (un retrait/filtre peut la réduire).
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage  = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  if (isLoading) {
    return (
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
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barre : recherche + compteur + inviter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0) }}
            placeholder="Search members…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} member{filtered.length === 1 ? "" : "s"}
        </span>
        <ProjectInviteDialog workspace={workspace} projectId={projectId} onInvited={refreshMembers} />
      </div>

      {/* Liste */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {pageItems.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No members found.</p>
        )}
        {pageItems.map((member) => {
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
                    {isMe && <span className="ml-1 text-xs text-muted-foreground font-normal">(you)</span>}
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
                <div>Joined</div>
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
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive [&_svg]:text-destructive"
                      onClick={() => handleRemove(member.id, member.email)}
                    >
                      <UserMinus className="size-4" />
                      Remove from project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination - seulement si ça dépasse une page */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 tabular-nums">Page {safePage + 1} / {pageCount}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
