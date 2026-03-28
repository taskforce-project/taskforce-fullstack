"use client"

import {
  FolderKanban,
  CircleDot,
  CheckSquare,
  Users,
  ArrowUpRight,
  Plus,
  UserPlus,
  TrendingUp,
  Clock,
} from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/lib/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PlanGate } from "@/components/common/plan-gate"

// ---------------------------------------------------------------------------
// Static placeholder data — will be replaced by API calls (React Query) later
// ---------------------------------------------------------------------------

const STATS = [
  {
    key: "stats.activeProjects",
    value: 4,
    icon: FolderKanban,
    trend: "+1 this month",
    href: "/projects",
  },
  {
    key: "stats.openIssues",
    value: 18,
    icon: CircleDot,
    trend: "-3 this week",
    href: "/projects",
  },
  {
    key: "stats.myTasks",
    value: 7,
    icon: CheckSquare,
    trend: "2 due today",
    href: "/my-work/issues",
  },
  {
    key: "stats.teamMembers",
    value: 12,
    icon: Users,
    trend: "+2 this month",
    href: "/members",
  },
] as const

const RECENT_ACTIVITY = [
  {
    id: "1",
    user: { name: "Alice Martin", initials: "AM" },
    action: "closed issue",
    target: "#TF-42 — Fix login redirect",
    time: "5 min ago",
    type: "issue",
  },
  {
    id: "2",
    user: { name: "Bob Chen", initials: "BC" },
    action: "created project",
    target: "Mobile App v2",
    time: "1 h ago",
    type: "project",
  },
  {
    id: "3",
    user: { name: "Camille Dupont", initials: "CD" },
    action: "started cycle",
    target: "Sprint 8 — Backend API",
    time: "2 h ago",
    type: "cycle",
  },
  {
    id: "4",
    user: { name: "David Kim", initials: "DK" },
    action: "commented on",
    target: "#TF-38 — Analytics dashboard",
    time: "3 h ago",
    type: "comment",
  },
  {
    id: "5",
    user: { name: "Eva Rossi", initials: "ER" },
    action: "invited member",
    target: "frank@taskforce.io",
    time: "yesterday",
    type: "member",
  },
] as const

const WORKLOAD = [
  { name: "Alice M.", initials: "AM", open: 8, capacity: 10 },
  { name: "Bob C.", initials: "BC", open: 3, capacity: 10 },
  { name: "Camille D.", initials: "CD", open: 11, capacity: 10 },
  { name: "David K.", initials: "DK", open: 6, capacity: 10 },
] as const

type WorkloadItem = (typeof WORKLOAD)[number]

function WorkloadBar({ item }: { readonly item: WorkloadItem }) {
  const pct = Math.min((item.open / item.capacity) * 100, 100)
  const overloaded = item.open > item.capacity

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="text-xs">{item.initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{item.name}</span>
          <span className={overloaded ? "text-destructive font-medium" : "text-muted-foreground"}>
            {item.open}/{item.capacity}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overloaded ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {overloaded && (
        <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0">
          Overloaded
        </Badge>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth()
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("dashboard.welcomeBack")},{" "}
            <span className="text-primary">{user?.firstName ?? "…"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.title")}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card
            key={stat.key}
            className="backdrop-blur-md bg-card/80 border-border/50 hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t(`dashboard.${stat.key}`)}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{stat.value}</span>
                <Link
                  href={stat.href}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{stat.trend}</span>
                  <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Body grid: activity + quick actions + workload */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent activity — 2 cols */}
        <Card className="lg:col-span-2 backdrop-blur-md bg-card/80 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base">{t("dashboard.activity.title")}</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inbox" className="flex items-center gap-1 text-xs">
                {t("dashboard.activity.viewAll")}
                <ArrowUpRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {RECENT_ACTIVITY.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <Avatar className="size-7 mt-0.5 shrink-0">
                  <AvatarFallback className="text-xs">{event.user.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{event.user.name}</span>{" "}
                    <span className="text-muted-foreground">{event.action}</span>{" "}
                    <span className="font-medium truncate">{event.target}</span>
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Clock className="size-3" />
                    {event.time}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right column: quick actions + workload */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <Card className="backdrop-blur-md bg-card/80 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("dashboard.quickActions.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" className="justify-start gap-2 w-full" asChild>
                <Link href="/projects/new">
                  <Plus className="size-4" />
                  {t("dashboard.quickActions.createProject")}
                </Link>
              </Button>
              <Button variant="outline" className="justify-start gap-2 w-full" asChild>
                <Link href="/projects">
                  <CircleDot className="size-4" />
                  {t("dashboard.quickActions.createIssue")}
                </Link>
              </Button>
              <Button variant="outline" className="justify-start gap-2 w-full" asChild>
                <Link href="/members">
                  <UserPlus className="size-4" />
                  {t("dashboard.quickActions.inviteMember")}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Team workload — gated behind pro plan for the full view */}
          <Card className="backdrop-blur-md bg-card/80 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{t("dashboard.workload.title")}</CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <PlanGate minPlan="pro">
                <div className="space-y-3">
                  {WORKLOAD.map((item) => (
                    <WorkloadBar key={item.initials} item={item} />
                  ))}
                </div>
              </PlanGate>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
