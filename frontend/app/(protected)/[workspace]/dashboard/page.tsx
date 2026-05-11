"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowUpRight, ArrowUp, ArrowDown, Minus,
  AlertTriangle, CheckCircle2, ChevronRight,
  Zap, TrendingUp, TrendingDown, Clock,
} from "lucide-react"
import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Data ─────────────────────────────────────────────────────────────────────

const PULSE = [
  { id: "ops",    label: "Active ops",    value: 4,  delta: +1, href: "./projects",       urgent: false },
  { id: "issues", label: "Open issues",   value: 18, delta: +3, href: "./projects",       urgent: false },
  { id: "risk",   label: "At risk",       value: 3,  delta: +2, href: "./projects",       urgent: true  },
  { id: "queue",  label: "My queue",      value: 7,  delta: -2, href: "./my-work/issues", urgent: false },
  { id: "agents", label: "Agents active", value: 2,  delta:  0, href: "./agents",         urgent: false },
] as const

const EXCEPTIONS = [
  { id: "1", severity: "critical" as const, source: "COO",    message: "Mobile App sprint velocity −31% — delivery at risk",  age: "2h" },
  { id: "2", severity: "warning"  as const, source: "System", message: "TF-38 overdue by 2 days — no assignee update",        age: "5h" },
]

const OPERATIONS = [
  { id: "1", name: "Website Redesign", sprint: "Sprint 9", progress: 72, done: 13, total: 18, velocity: +8,  daysLeft: 4, status: "on_track" as const },
  { id: "2", name: "Mobile App v2",    sprint: "Sprint 3", progress: 41, done: 7,  total: 17, velocity: -31, daysLeft: 6, status: "at_risk"  as const },
  { id: "3", name: "API v2 Migration", sprint: "Sprint 6", progress: 88, done: 15, total: 17, velocity: +12, daysLeft: 2, status: "on_track" as const },
]

const AI_INSIGHTS = [
  { id: "1", agent: "CFO", agentColor: "#30d158", category: "Finance",    urgency: "medium" as const, confidence: 74, action: "Review financial model", href: "./agents",
    insight: "Cash runway extends 18 months at current burn. Deploy €40K into paid acquisition before Q3 to hit revenue targets." },
  { id: "2", agent: "COO", agentColor: "#0a84ff", category: "Operations", urgency: "high"   as const, confidence: 91, action: "Adjust sprint scope",   href: "./agents",
    insight: "Mobile App sprint velocity dropped 31% vs last cycle. Remove 3 scope items now or ETA slips 8 days." },
  { id: "3", agent: "CPO", agentColor: "#ff9f0a", category: "Product",    urgency: "medium" as const, confidence: 68, action: "Update roadmap",        href: "./agents",
    insight: "Advanced Filters has 47 upvotes and is blocking 3 enterprise trials. Reprioritizing could unlock ~€12K MRR." },
]

const AGENTS = [
  { id: "ceo",  acronym: "CEO",  status: "standby" as const, task: "Strategic overview updated",      ago: "2h",  color: "#a78bfa" },
  { id: "cfo",  acronym: "CFO",  status: "active"  as const, task: "Generating Q2 burn analysis…",    ago: "now", color: "#30d158" },
  { id: "coo",  acronym: "COO",  status: "active"  as const, task: "Sprint risk assessment complete", ago: "4m",  color: "#0a84ff" },
  { id: "cto",  acronym: "CTO",  status: "standby" as const, task: "Architecture review complete",    ago: "1d",  color: "#38bdf8" },
  { id: "cpo",  acronym: "CPO",  status: "standby" as const, task: "Roadmap prioritization updated",  ago: "3h",  color: "#ff9f0a" },
  { id: "chro", acronym: "CHRO", status: "idle"    as const, task: "Last active yesterday",           ago: "1d",  color: "#f472b6" },
]

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  on_track: { label: "On track", text: "text-emerald-400", fill: "progress-fill--on-track"  },
  at_risk:  { label: "At risk",  text: "text-amber-400",   fill: "progress-fill--at-risk"   },
  blocked:  { label: "Blocked",  text: "text-red-400",     fill: "progress-fill--blocked"   },
}

const STATUS_DOT: Record<string, string> = {
  active:  "status-dot--active",
  standby: "status-dot--standby",
  idle:    "status-dot--idle",
}

// ─── Animation ────────────────────────────────────────────────────────────────

const stagger = { animate: { transition: { staggerChildren: 0.04 } } }
const row = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function LiveClock() {
  const [t, setT] = useState("")
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])
  return <span className="text-mono-xs tabular-nums">{t}</span>
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <Minus className="size-2.5 label-faint" />
  const up = value > 0
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px] font-semibold", up ? "text-red-400" : "text-emerald-400")}>
      {up ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}{Math.abs(value)}
    </span>
  )
}

function ConfBar({ value }: { value: number }) {
  const fillClass = value >= 80 ? "conf-bar__fill--high" : value >= 60 ? "conf-bar__fill--mid" : "conf-bar__fill--low"
  return (
    <div className="conf-bar">
      <div className="conf-bar__track">
        <div className={cn("conf-bar__fill", fillClass)} style={{ width: `${value}%` }} />
      </div>
      <span className="conf-bar__label">{value}%</span>
    </div>
  )
}

function SectionLabel({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="section-header">
      <p className="label-overline">{children}</p>
      {href && (
        <Link href={href} className="section-header-link">
          View all <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("glass-card", className)}>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? "—"
  const hour = new Date().getHours()
  const greeting = hour < 5 ? "Still up," : hour < 12 ? "Good morning," : hour < 18 ? "Good afternoon," : "Good evening,"
  const criticals = EXCEPTIONS.filter(e => e.severity === "critical").length
  const decisions  = AI_INSIGHTS.filter(i => i.urgency === "high").length

  return (
    <motion.div className="flex flex-col gap-6" variants={stagger} initial="initial" animate="animate">

      {/* ── System strip ─────────────────────────────────────────────── */}
      <motion.div variants={row} className="system-strip">
        <div className="flex items-center gap-2">
          <span className="glow-dot">
            <span className="glow-dot__ring glow-dot--emerald" />
            <span className="glow-dot__core glow-dot--emerald" />
          </span>
          <span className="label-dim" style={{ fontSize: "0.6875rem" }}>All systems operational</span>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <span className="text-mono-xs">Taskforce OS · v1.0</span>
        </div>
      </motion.div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.div variants={row} className="flex items-end justify-between gap-4">
        <div>
          <p className="label-overline mb-1">{greeting}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{firstName}</h1>
        </div>

        <div className="flex items-center gap-2 pb-0.5">
          {criticals > 0 && (
            <div className="badge-critical">
              <AlertTriangle className="size-3 shrink-0" />
              {criticals} critical
            </div>
          )}
          {decisions > 0 && (
            <div className="badge-decision">
              <Zap className="size-3 shrink-0" />
              {decisions} decision{decisions > 1 ? "s" : ""} pending
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Operational pulse ─────────────────────────────────────────── */}
      <motion.div variants={row}>
        <div className="pulse-strip">
          {PULSE.map(m => (
            <Link
              key={m.id}
              href={m.href}
              className={cn("pulse-item", m.urgent && m.value > 0 && "pulse-item--urgent")}
            >
              <div className="flex items-center justify-between">
                <span className="label-overline">{m.label}</span>
                <Delta value={m.delta} />
              </div>
              <span className={cn("metric-value", m.urgent && m.value > 0 ? "text-red-400" : "text-foreground")}>
                {m.value}
              </span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Left 2/3 */}
        <div className="space-y-5 lg:col-span-2">

          {/* Needs Attention */}
          <AnimatePresence>
            {EXCEPTIONS.length > 0 && (
              <motion.section variants={row}>
                <SectionLabel>Needs attention</SectionLabel>
                <div className="space-y-1.5">
                  {EXCEPTIONS.map(ex => (
                    <Link
                      key={ex.id}
                      href="./projects"
                      className={cn(
                        "group alert-row",
                        ex.severity === "critical" ? "alert-row--critical" : "alert-row--warning",
                      )}
                    >
                      <AlertTriangle className={cn("size-3.5 shrink-0", ex.severity === "critical" ? "text-red-400" : "text-amber-400")} />
                      <p className={cn("flex-1 text-[12px] leading-relaxed font-medium",
                        ex.severity === "critical" ? "text-red-300" : "text-amber-300")}>{ex.message}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="source-tag">{ex.source}</span>
                        <span className="text-mono-xs">{ex.age}</span>
                        <ChevronRight className="size-3 opacity-0 group-hover:opacity-50 transition-opacity label-dim" />
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Active Operations */}
          <motion.section variants={row}>
            <SectionLabel href="./projects">Active operations</SectionLabel>
            <Card className="overflow-hidden">
              {OPERATIONS.map((op, i) => {
                const st = STATUS_CFG[op.status]
                return (
                  <Link
                    key={op.id}
                    href={`./projects/${op.id}`}
                    className={cn("group item-row item-row--lg", i < OPERATIONS.length - 1 && "item-divider")}
                  >
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{op.name}</p>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold",
                            op.velocity > 0 ? "text-emerald-400" : "text-red-400")}>
                            {op.velocity > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                            {op.velocity > 0 ? "+" : ""}{op.velocity}%
                          </span>
                          <span className={cn("text-[11px] font-medium", st.text)}>{st.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="progress-track">
                          <div className={cn("progress-fill", st.fill)} style={{ width: `${op.progress}%` }} />
                        </div>
                        <span className="text-mono-sm shrink-0">{op.done}/{op.total}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-mono-sm">{op.sprint}</span>
                      <div className="flex items-center gap-1 text-mono-xs">
                        <Clock className="size-2.5" /><span>{op.daysLeft}d</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </Card>
          </motion.section>

          {/* AI Recommendations */}
          <motion.section variants={row}>
            <SectionLabel href="./agents">AI recommendations</SectionLabel>
            <div className="space-y-2">
              {AI_INSIGHTS.map(ins => (
                <div
                  key={ins.id}
                  className={cn("ai-card", ins.urgency === "high" && "ai-card--high")}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      className="agent-tag"
                      style={{ "--agent-color": ins.agentColor } as React.CSSProperties}
                    >
                      {ins.agent}
                    </span>
                    <span className="label-dim" style={{ fontSize: "0.625rem" }}>{ins.category}</span>
                    {ins.urgency === "high" && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#a78bfa" }}>
                        <Zap className="size-2.5" />AI priority
                      </span>
                    )}
                  </div>
                  {/* Insight */}
                  <p className="text-[13px] leading-relaxed mb-4 label-soft">{ins.insight}</p>
                  {/* Footer */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="label-overline-faint mb-1.5">Confidence</p>
                      <ConfBar value={ins.confidence} />
                    </div>
                    <Button variant="ghost" size="sm"
                      className="h-7 px-3 text-xs shrink-0 rounded-lg border"
                      style={{ borderColor: "var(--separator)" }}
                      asChild>
                      <Link href={ins.href} className="flex items-center gap-1.5">
                        {ins.action}<ArrowUpRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-5">

          {/* Agent Activity */}
          <motion.section variants={row}>
            <SectionLabel href="./agents">Agent activity</SectionLabel>
            <Card className="overflow-hidden">
              {AGENTS.map((agent, i) => (
                <Link
                  key={agent.id}
                  href="./agents"
                  className={cn("group item-row", i < AGENTS.length - 1 && "item-divider")}
                >
                  <div className={cn("status-dot shrink-0", STATUS_DOT[agent.status])}>
                    {agent.status === "active" && <div className="status-dot__ping" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: agent.color }}>{agent.acronym}</span>
                      <span className="text-mono-xs tabular-nums">{agent.ago}</span>
                    </div>
                    <p className="text-[11px] truncate mt-0.5 label-dim">{agent.task}</p>
                  </div>
                </Link>
              ))}
            </Card>
          </motion.section>

          {/* Pending Decisions */}
          <motion.section variants={row}>
            <SectionLabel>Pending decisions</SectionLabel>
            <div className="space-y-1.5">
              {AI_INSIGHTS.filter(i => i.urgency === "high").map(ins => (
                <Link
                  key={ins.id}
                  href={ins.href}
                  className="group item-row glass-card"
                >
                  <div
                    className="agent-avatar agent-avatar--sm shrink-0 mt-0.5"
                    style={{ "--agent-color": ins.agentColor } as React.CSSProperties}
                  >
                    {ins.agent}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{ins.action}</p>
                    <p className="text-[10px] mt-0.5 label-dim">{ins.confidence}% confidence</p>
                  </div>
                  <ChevronRight className="size-3 shrink-0 mt-1 opacity-0 group-hover:opacity-40 transition-opacity" />
                </Link>
              ))}
              {AI_INSIGHTS.filter(i => i.urgency === "high").length === 0 && (
                <div className="item-row glass-card">
                  <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[12px] label-dim">No decisions pending</span>
                </div>
              )}
            </div>
          </motion.section>

        </div>
      </div>
    </motion.div>
  )
}
