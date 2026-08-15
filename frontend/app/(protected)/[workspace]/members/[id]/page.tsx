"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Crown,
  Shield,
  User,
  Mail,
  Calendar,
  Clock,
  CircleDot,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { MemberSkillsCard } from "@/components/members/member-skills-card"
import { MemberAvailabilityCard } from "@/components/members/member-availability-card"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useUserStore } from "@/lib/store/user-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useIssueStore } from "@/lib/store/issue-store"
import type { WorkspaceRole } from "@/lib/api/workspace-service"
import type { Issue } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  OWNER:  { label: "Owner",  badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",   icon: <Crown  className="h-3 w-3 text-amber-400" /> },
  ADMIN:  { label: "Admin",  badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20", icon: <Shield className="h-3 w-3 text-violet-400" /> },
  MEMBER: { label: "Member", badgeClass: "bg-muted text-muted-foreground border-border",           icon: <User   className="h-3 w-3 text-muted-foreground" /> },
}

const MEMBER_COLORS = [
  "bg-primary", "bg-violet-500", "bg-emerald-500",
  "bg-orange-500", "bg-blue-500", "bg-pink-500", "bg-cyan-500",
]

function issueDotColor(category: string): string {
  if (category === "COMPLETED") return "text-emerald-400"
  if (category === "CANCELLED") return "text-red-400"
  if (category === "STARTED")   return "text-blue-400"
  return "text-muted-foreground"
}

function IssueList({ issues, loading, slug }: Readonly<{ issues: Issue[]; loading: boolean; slug: string }>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (issues.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune issue assignée à ce membre.</p>
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {issues.map((issue) => (
        <Link
          key={issue.id}
          href={`/${slug}/projects/${issue.projectId}?issue=${issue.id}`}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors group"
        >
          <CircleDot className={cn("h-3.5 w-3.5 shrink-0", issueDotColor(issue.status.category))} />
          <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
            {issue.identifier}
          </span>
          <span className="flex-1 text-sm text-foreground truncate">{issue.title}</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </Link>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemberProfilePage() {
  const params   = useParams()
  const slug     = typeof params.workspace === "string" ? params.workspace : ""
  const memberId = typeof params.id        === "string" ? Number(params.id) : 0

  const { members, fetchMembers, membersLoading } = useWorkspaceStore()
  const { user }                                  = useUserStore()
  const { projects, fetchProjects }               = useProjectStore()
  const { fetchIssues }                           = useIssueStore()

  const [assignedIssues, setAssignedIssues] = useState<Issue[]>([])
  const [issuesLoading,  setIssuesLoading]  = useState(false)

  useEffect(() => {
    if (!slug) return
    if (members.length === 0) void fetchMembers()
    void fetchProjects(slug)
  }, [slug, members.length, fetchMembers, fetchProjects])

  const member = members.find((m) => m.id === memberId)

  useEffect(() => {
    if (!member || projects.length === 0 || !slug) return
    setIssuesLoading(true)
    void Promise.all(projects.map((p) => fetchIssues(slug, p.id)))
      .then((results) => {
        const flat = results.flat().filter((i) => i.assignee?.id === member.userId)
        setAssignedIssues(flat)
      })
      .finally(() => setIssuesLoading(false))
  }, [member, projects, slug, fetchIssues])

  if (membersLoading || !member) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isYou    = user?.email === member.email
  const myRole   = members.find((m) => m.email === user?.email)?.role
  const canEdit  = isYou || myRole === "OWNER" || myRole === "ADMIN"
  const role     = ROLE_CONFIG[member.role]
  const color      = MEMBER_COLORS[member.userId % MEMBER_COLORS.length]
  const doneCount  = assignedIssues.filter((i) => i.status.category === "COMPLETED").length
  const inProgress = assignedIssues.filter((i) => i.status.category === "STARTED").length

  const recentIssues = [...assignedIssues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const joinedLabel = new Date(member.joinedAt).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  })

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">

      {/* Back nav */}
      <div>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground" asChild>
          <Link href={`/${slug}/members`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Membres
          </Link>
        </Button>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {/* Banner */}
        <div className={cn("h-20 w-full opacity-20", color)} />

        {/* Content */}
        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end gap-4 mb-4">
            <UserAvatar
              email={member.email}
              name={member.displayName ?? member.email}
              avatarUrl={member.avatarUrl}
              className="h-20 w-20 ring-4 ring-background"
              fallbackClassName="text-2xl font-semibold"
            />
            <div className="mb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">
                  {member.displayName ?? member.email}
                </h1>
                {isYou && <Badge variant="secondary" className="text-xs">Vous</Badge>}
              </div>
              <Badge variant="outline" className={cn("text-xs border mt-1 gap-1", role.badgeClass)}>
                {role.icon}
                {role.label}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {member.email}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Rejoint le {joinedLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Issues assignées", value: assignedIssues.length, icon: CircleDot },
          { label: "Issues terminées", value: doneCount,             icon: CheckCircle2 },
          { label: "Issues en cours",  value: inProgress,            icon: Clock },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span className="text-xs">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {issuesLoading ? "—" : value}
            </p>
          </div>
        ))}
      </div>

      <Separator />

      {/* Skills profile — feeds Smart Assign (PROD-1.2) */}
      <MemberSkillsCard slug={slug} userId={member.userId} canEdit={canEdit} />

      {/* Disponibilité — congés / indisponibilités (US-006) */}
      <MemberAvailabilityCard slug={slug} userId={member.userId} canEdit={canEdit} />

      {/* Recent issues */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Issues récentes</h2>
        <IssueList issues={recentIssues} loading={issuesLoading} slug={slug} />
      </section>
    </div>
  )
}
