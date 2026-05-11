"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowUpRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Data ─────────────────────────────────────────────────────────────────────

const METRICS = [
  { label: "active projects", value: 4, href: "./projects" },
  { label: "open issues", value: 18, href: "./projects" },
  { label: "assigned to me", value: 7, href: "./my-work/issues" },
  { label: "team members", value: 12, href: "./members" },
] as const

const WORKSTREAMS = [
  { id: "1", name: "Website Redesign", cycle: "Sprint 9", progress: 72, done: 13, total: 18, status: "on_track" as const },
  { id: "2", name: "Mobile App v2",    cycle: "Sprint 3", progress: 41, done: 7,  total: 17, status: "at_risk"  as const },
  { id: "3", name: "API v2 Migration", cycle: "Sprint 6", progress: 88, done: 15, total: 17, status: "on_track" as const },
]

const AI_INSIGHTS = [
  {
    id: "1",
    agent: "CFO",
    agentClass: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    insight: "Cash runway extends 18 months at current burn. Consider deploying €40K into paid acquisition before Q3.",
    action: "Review financials",
    urgency: "medium" as const,
  },
  {
    id: "2",
    agent: "COO",
    agentClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    insight: "Mobile App sprint velocity dropped 31% vs last cycle. Recommend removing 3 scope items to protect delivery.",
    action: "Adjust scope",
    urgency: "high" as const,
  },
]

const AGENTS = [
  { id: "ceo",  label: "CEO",  status: "standby" as const, last: "Strategic overview updated 2h ago" },
  { id: "cfo",  label: "CFO",  status: "active"  as const, last: "Generating Q2 burn analysis…"      },
  { id: "coo",  label: "COO",  status: "active"  as const, last: "Sprint risk assessment ready"       },
  { id: "cto",  label: "CTO",  status: "standby" as const, last: "Architecture review 1d ago"         },
  { id: "cpo",  label: "CPO",  status: "standby" as const, last: "Roadmap prioritization 3h ago"      },
  { id: "chro", label: "CHRO", status: "idle"    as const, last: "Last active yesterday"              },
]

const ALERTS = [
  { id: "1", message: "Mobile App sprint at risk — velocity −31%", severity: "high"   as const },
  { id: "2", message: "TF-38 overdue by 2 days",                   severity: "medium" as const },
]

// ─── Config maps ──────────────────────────────────────────────────────────────

const AGENT_STATUS = {
  active:  { dot: "bg-amber-400",              pulse: true,  label: "Generating" },
  standby: { dot: "bg-emerald-400",            pulse: false, label: "Ready"      },
  idle:    { dot: "bg-muted-foreground/30",    pulse: false, label: "Idle"       },
}

const WORKSTREAM_STATUS = {
  on_track: { color: "text-emerald-400", label: "On track" },
  at_risk:  { color: "text-amber-400",   label: "At risk"  },
  blocked:  { color: "text-red-400",     label: "Blocked"  },
}

// ─── Stagger animation ────────────────────────────────────────────────────────

const container = { animate: { transition: { staggerChildren: 0.05 } } }
const item = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
}

// ─── Live clock ───────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState("")
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono text-xs tabular-nums text-muted-foreground/50">{time}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? "—"

  const hour = new Date().getHours()
  let greeting = "Good evening"
  if (hour < 12) greeting = "Good morning"
  else if (hour < 18) greeting = "Good afternoon"

  return (
    <motion.div className="flex flex-col gap-8" variants={container} initial="initial" animate="animate">

      {/* Status strip */}
      <motion.div variants={item} className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-muted-foreground/50 tracking-wide">All systems operational</span>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <span className="text-[11px] text-muted-foreground/30 font-mono">Taskforce OS · v1.0</span>
        </div>
      </motion.div>

      {/* Greeting */}
      <motion.div variants={item}>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/40 mb-1">{greeting}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{firstName}</h1>
      </motion.div>

      {/* Metrics strip */}
      <motion.div variants={item}>
        <div className="flex divide-x divide-border rounded-xl border border-border bg-card overflow-hidden">
          {METRICS.map((m) => (
            <Link
              key={m.label}
              href={m.href}
              className="group flex-1 flex flex-col gap-1.5 px-6 py-5 hover:bg-muted/30 transition-colors"
            >
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{m.value}</span>
              <span className="text-[11px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors leading-tight">{m.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Left (2/3) ── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Workstreams */}
          <motion.section variants={item}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/40">Active workstreams</p>
              <Link href="./projects" className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors">
                All projects <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {WORKSTREAMS.map((ws) => {
                const st = WORKSTREAM_STATUS[ws.status]
                return (
                  <div key={ws.id} className="flex items-center gap-5 px-5 py-4 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground truncate">{ws.name}</p>
                        <span className={cn("text-[11px] font-medium shrink-0", st.color)}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${ws.progress}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
                          {ws.done}/{ws.total} · {ws.progress}%
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 font-mono shrink-0">{ws.cycle}</span>
                  </div>
                )
              })}
            </div>
          </motion.section>

          {/* AI Recommendations */}
          <motion.section variants={item}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/40">AI recommendations</p>
              <Link href="./agents" className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors">
                Open cockpit <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {AI_INSIGHTS.map((ins) => (
                <div
                  key={ins.id}
                  className={cn(
                    "flex items-start gap-4 rounded-xl border bg-card px-5 py-4 hover:bg-muted/20 transition-colors",
                    ins.urgency === "high" ? "border-amber-500/15" : "border-border"
                  )}
                >
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-md shrink-0 mt-0.5 tracking-wider", ins.agentClass)}>
                    {ins.agent}
                  </span>
                  <div className="flex-1 min-w-0 space-y-3">
                    <p className="text-sm text-foreground/85 leading-relaxed">{ins.insight}</p>
                    <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-primary hover:text-primary hover:bg-primary/10 -ml-3" asChild>
                      <Link href="./agents" className="flex items-center gap-1.5">
                        {ins.action} <ArrowUpRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* ── Right (1/3) ── */}
        <div className="space-y-6">

          {/* Agent suite */}
          <motion.section variants={item}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/40">Agent suite</p>
              <Link href="./agents" className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors">
                <Sparkles className="size-3" /> Open
              </Link>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {AGENTS.map((agent) => {
                const s = AGENT_STATUS[agent.status]
                return (
                  <Link
                    key={agent.id}
                    href="./agents"
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors"
                  >
                    {/* Status dot */}
                    <div className="relative size-2 shrink-0">
                      <div className={cn("size-2 rounded-full", s.dot)} />
                      {s.pulse && (
                        <div className={cn("absolute inset-0 rounded-full animate-ping opacity-50", s.dot)} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">{agent.label}</span>
                        <span className="text-[10px] text-muted-foreground/40">{s.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5">{agent.last}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </motion.section>

          {/* Critical alerts */}
          {ALERTS.length > 0 && (
            <motion.section variants={item}>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/40 mb-3">Critical alerts</p>
              <div className="space-y-2">
                {ALERTS.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[12px] leading-relaxed",
                      alert.severity === "high"
                        ? "border-red-500/20 bg-red-500/5 text-red-400"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-400"
                    )}
                  >
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    {alert.message}
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      </div>
    </motion.div>
  )
}


