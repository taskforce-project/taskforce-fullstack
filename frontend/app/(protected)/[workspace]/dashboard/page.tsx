"use client"

import Link from "next/link"
import {
  FolderKanban,
  Users,
  CheckSquare,
  CircleDot,
  Clock,
  ArrowUpRight,
  AlertTriangle,
  Sparkles,
} from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Pod } from "@/components/ui/pod"

// ---------------------------------------------------------------------------
// Static placeholder data
// ---------------------------------------------------------------------------

const STATS = [
  { label: "Active Projects", value: 4, icon: FolderKanban, href: "./projects" },
  { label: "Open Issues", value: 18, icon: CircleDot, href: "./projects" },
  { label: "My Tasks", value: 7, icon: CheckSquare, href: "./my-work/issues" },
  { label: "Members", value: 12, icon: Users, href: "./members" },
] as const

const ACTIVITY = [
  { id: "1", initials: "AM", name: "Alice Martin", action: "closed", target: "#TF-42 Fix login redirect", time: "5m" },
  { id: "2", initials: "BC", name: "Bob Chen", action: "created project", target: "Mobile App v2", time: "1h" },
  { id: "3", initials: "CD", name: "Camille Dupont", action: "started cycle", target: "Sprint 8 — Backend", time: "2h" },
  { id: "4", initials: "DK", name: "David Kim", action: "commented on", target: "#TF-38 Analytics", time: "3h" },
] as const

const TODAY_PRIORITIES = [
  { id: "TF-41", title: "Fix login redirect after session expiry", priority: "high" as const },
  { id: "TF-43", title: "Update API documentation for v2 endpoints", priority: "medium" as const },
  { id: "TF-38", title: "Review analytics dashboard implementation", priority: "medium" as const },
  { id: "TF-44", title: "Add unit tests for auth service", priority: "low" as const },
]

const PRIORITY_COLOR: Record<"high" | "medium" | "low", string> = {
  high: "text-red-500 bg-red-500/10",
  medium: "text-amber-500 bg-amber-500/10",
  low: "text-muted-foreground bg-muted",
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? "…"

  const currentHour = new Date().getHours()
  let greeting = "Good evening"
  if (currentHour < 12) {
    greeting = "Good morning"
  } else if (currentHour < 18) {
    greeting = "Good afternoon"
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting},{" "}
          <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {firstName}
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          Here&apos;s what&apos;s happening in your workspace
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group rounded-xl border border-border bg-card px-4 py-4 transition-all hover:border-primary/30 hover:shadow-sm flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-md bg-muted p-1.5 transition-colors group-hover:bg-primary/10">
                <stat.icon className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <ArrowUpRight className="size-3 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Today priorities + AI CTA */}
        <div className="space-y-6 lg:col-span-2">
          {/* Today priorities */}
          <Pod
            title="Today&apos;s priorities"
            description="Your most urgent tasks"
            action={
              <Button variant="ghost" size="sm" className="h-auto px-3 py-1.5 text-xs font-medium" asChild>
                <Link href="./my-work/issues" className="flex items-center gap-1.5">
                  All tasks <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            }
          >
            <div className="space-y-2">
              {TODAY_PRIORITIES.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 hover:border-primary/30 hover:bg-muted/30 transition-all"
                >
                  <div className="size-4 rounded border border-border shrink-0" />
                  <span className="flex-1 text-sm font-medium text-foreground/90 truncate">{item.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono">#{item.id}</span>
                    {item.priority === "high" && (
                      <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_COLOR[item.priority]}`}>
                        <AlertTriangle className="size-2.5" />
                        High
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Pod>

          {/* AI Agents CTA */}
          <Link
            href="./agents"
            className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">AI Executive Suite</p>
              <p className="text-xs text-muted-foreground">6 agents ready — CEO, CFO, COO, CTO, CPO, CHRO</p>
            </div>
            <span className="text-xs text-primary font-medium flex items-center gap-1 shrink-0 group-hover:gap-1.5 transition-all">
              Open cockpit <ArrowUpRight className="size-3.5" />
            </span>
          </Link>
        </div>

        {/* Right: Activity */}
        <div>
          <Pod
            title="Recent activity"
            action={
              <Button variant="ghost" size="sm" className="h-auto px-3 py-1.5 text-xs font-medium" asChild>
                <Link href="./inbox" className="flex items-center gap-1.5">
                  View all <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            }
          >
            <div className="space-y-3">
              {ACTIVITY.map((event) => (
                <div
                  key={event.id}
                  className="group flex items-start gap-3 rounded-lg border border-border bg-background p-3 transition-all hover:border-primary/30 hover:bg-muted/30"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs font-medium">{event.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm leading-tight">
                      <span className="font-semibold">{event.name}</span>{" "}
                      <span className="text-muted-foreground">{event.action}</span>
                    </p>
                    <p className="truncate text-sm font-medium text-foreground/90">{event.target}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" />
                      <span className="font-medium">{event.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Pod>
        </div>
      </div>
    </div>
  )
}
