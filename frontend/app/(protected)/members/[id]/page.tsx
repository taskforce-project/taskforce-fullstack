"use client"

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
  FolderKanban,
  CircleDot,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Mock data (same as members/page.tsx)
// ---------------------------------------------------------------------------

type MemberRole = "owner" | "admin" | "member"

interface WorkspaceMember {
  id: string
  name: string
  email: string
  initials: string
  color: string
  role: MemberRole
  joinedAt: string
  lastActive: string
  projectsCount: number
  issuesCount: number
  isYou?: boolean
  bio?: string
}

const WORKSPACE_MEMBERS: WorkspaceMember[] = [
  { id: "1", name: "You", email: "you@taskforce.io", initials: "ME", color: "bg-primary", role: "owner", joinedAt: "Feb 10, 2026", lastActive: "Just now", projectsCount: 4, issuesCount: 23, isYou: true, bio: "Full-stack developer & workspace owner." },
  { id: "2", name: "Sophie Martin", email: "sophie.martin@taskforce.io", initials: "SM", color: "bg-violet-500", role: "admin", joinedAt: "Feb 12, 2026", lastActive: "2 hours ago", projectsCount: 3, issuesCount: 18, bio: "Frontend engineer, design system enthusiast." },
  { id: "3", name: "Emma Petit", email: "emma.petit@taskforce.io", initials: "EP", color: "bg-emerald-500", role: "member", joinedAt: "Feb 18, 2026", lastActive: "Yesterday", projectsCount: 2, issuesCount: 11, bio: "UX/UI designer focused on accessibility." },
  { id: "4", name: "Thomas Bernard", email: "thomas.bernard@taskforce.io", initials: "TB", color: "bg-orange-500", role: "member", joinedAt: "Mar 3, 2026", lastActive: "3 days ago", projectsCount: 2, issuesCount: 7, bio: "Backend & DevOps engineer." },
  { id: "5", name: "Lucas Dufour", email: "lucas.dufour@taskforce.io", initials: "LD", color: "bg-blue-500", role: "member", joinedAt: "Mar 15, 2026", lastActive: "Last week", projectsCount: 1, issuesCount: 5 },
]

const ROLE_CONFIG: Record<MemberRole, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  owner: { label: "Owner", badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: <Crown className="h-3 w-3 text-amber-400" /> },
  admin: { label: "Admin", badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/20", icon: <Shield className="h-3 w-3 text-violet-400" /> },
  member: { label: "Member", badgeClass: "bg-muted text-muted-foreground border-border", icon: <User className="h-3 w-3 text-muted-foreground" /> },
}

const RECENT_ISSUES = [
  { id: "TF-43", title: "Fix login screen crash on iOS 17", status: "in_progress", project: "Mobile App" },
  { id: "TF-38", title: "Implement push notification service", status: "in_review", project: "Mobile App" },
  { id: "TF-29", title: "API rate limiting — implement token bucket", status: "in_progress", project: "API v2" },
  { id: "TF-22", title: "Analytics integration with Plausible", status: "done", project: "Website Redesign" },
  { id: "TF-17", title: "SEO audit & initial fixes", status: "done", project: "Website Redesign" },
]

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  todo: { icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />, label: "To Do" },
  in_progress: { icon: <CircleDot className="h-3.5 w-3.5 text-blue-400" />, label: "In Progress" },
  in_review: { icon: <Clock className="h-3.5 w-3.5 text-yellow-400" />, label: "In Review" },
  done: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, label: "Done" },
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemberProfilePage() {
  const params = useParams()
  const memberId = typeof params.id === "string" ? params.id : "1"
  const member = WORKSPACE_MEMBERS.find((m) => m.id === memberId) ?? WORKSPACE_MEMBERS[0]
  const role = ROLE_CONFIG[member.role]

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">

      {/* Back nav */}
      <div>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/members">
            <ArrowLeft className="h-3.5 w-3.5" />
            Membres
          </Link>
        </Button>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {/* Banner */}
        <div className={cn("h-20 w-full", member.color, "opacity-20")} />

        {/* Content */}
        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end gap-4 mb-4">
            <Avatar className="h-20 w-20 ring-4 ring-background">
              <AvatarFallback className={cn("text-2xl font-semibold text-white", member.color)}>
                {member.initials}
              </AvatarFallback>
            </Avatar>
            <div className="mb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">{member.name}</h1>
                {member.isYou && (
                  <Badge variant="secondary" className="text-xs">Vous</Badge>
                )}
              </div>
              <Badge variant="outline" className={cn("text-xs border mt-1 gap-1", role.badgeClass)}>
                {role.icon}
                {role.label}
              </Badge>
            </div>
          </div>

          {member.bio && (
            <p className="text-sm text-muted-foreground mb-4">{member.bio}</p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {member.email}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Rejoint le {member.joinedAt}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Actif {member.lastActive}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Projets", value: member.projectsCount, icon: FolderKanban },
          { label: "Issues assignées", value: member.issuesCount, icon: CircleDot },
          { label: "Issues terminées", value: Math.floor(member.issuesCount * 0.6), icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span className="text-xs">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* Recent activity */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Issues récentes</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {RECENT_ISSUES.map((issue) => {
            const status = STATUS_CONFIG[issue.status]
            return (
              <div
                key={issue.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors group"
              >
                <div className="shrink-0">{status.icon}</div>
                <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">{issue.id}</span>
                <span className="flex-1 text-sm text-foreground truncate">{issue.title}</span>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:block flex items-center gap-1">
                  <FolderKanban className="h-3 w-3 inline mr-1" />
                  {issue.project}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
