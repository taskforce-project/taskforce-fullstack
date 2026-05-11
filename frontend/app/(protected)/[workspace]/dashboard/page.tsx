"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Zap,
  TrendingUp,
  TrendingDown,
  Clock,
  CircleDot,
} from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Static data (replace with real API later) ────────────────────────────────

const OPERATIONAL_PULSE = [
  {
    id: "ops",
    label: "Active ops",
    value: 4,
    delta: +1,
    href: "./projects",
    unit: "",
  },
  {
    id: "issues",
    label: "Open issues",
    value: 18,
    delta: +3,
    href: "./projects",
    unit: "",
  },
  {
    id: "at-risk",
    label: "At risk",
    value: 3,
    delta: +2,
    href: "./projects",
    unit: "",
    urgent: true,
  },
  {
    id: "queue",
    label: "My queue",
    value: 7,
    delta: -2,
    href: "./my-work/issues",
    unit: "",
  },
  {
    id: "agents",
    label: "Agents active",
    value: 2,
    delta: 0,
    href: "./agents",
    unit: "",
  },
] as const

const EXCEPTIONS = [
  {
    id: "1",
    severity: "critical" as const,
    source: "COO",
    message: "Mobile App sprint velocity −31% — delivery at risk",
    age: "2h ago",
    href: "./projects",
  },
  {
    id: "2",
    severity: "warning" as const,
    source: "System",
    message: "TF-38 overdue by 2 days — no assignee update",
    age: "5h ago",
    href: "./projects",
  },
]

const OPERATIONS = [
  {
    id: "1",
    name: "Website Redesign",
    sprint: "Sprint 9",
    progress: 72,
    done: 13,
    total: 18,
    velocity: +8,
    daysLeft: 4,
    status: "on_track" as const,
    href: "./projects/1",
  },
  {
    id: "2",
    name: "Mobile App v2",
    sprint: "Sprint 3",
    progress: 41,
    done: 7,
    total: 17,
    velocity: -31,
    daysLeft: 6,
    status: "at_risk" as const,
    href: "./projects/2",
  },
  {
    id: "3",
    name: "API v2 Migration",
    sprint: "Sprint 6",
    progress: 88,
    done: 15,
    total: 17,
    velocity: +12,
    daysLeft: 2,
    status: "on_track" as const,
    href: "./projects/3",
  },
]

const AI_INSIGHTS = [
  {
    id: "1",
    agent: "CFO",
    agentColor: "#30d158",
    category: "Financial",
    insight:
      "Cash runway extends 18 months at current burn. Deploy €40K into paid acquisition before Q3 to hit revenue targets with 74% confidence.",
    action: "Review financial model",
    urgency: "medium" as const,
    confidence: 74,
    href: "./agents",
  },
  {
    id: "2",
    agent: "COO",
    agentColor: "#0a84ff",
    category: "Operations",
    insight:
      "Mobile App sprint velocity dropped 31% vs last cycle. Remove 3 scope items now to protect delivery date — otherwise ETA slips 8 days.",
    action: "Adjust sprint scope",
    urgency: "high" as const,
    confidence: 91,
    href: "./agents",
  },
  {
    id: "3",
    agent: "CPO",
    agentColor: "#ff9f0a",
    category: "Product",
    insight:
      "Advanced Filters has 47 upvotes and is blocking 3 enterprise trials. Reprioritizing to top of Q3 would accelerate revenue by est. €12K MRR.",
    action: "Update roadmap",
    urgency: "medium" as const,
    confidence: 68,
    href: "./agents",
  },
]

const AGENTS = [
  {
    id: "ceo",
    acronym: "CEO",
    title: "Chief Executive Officer",
    status: "standby" as const,
    task: "Strategic overview updated",
    ago: "2h ago",
    color: "#a78bfa",
  },
  {
    id: "cfo",
    acronym: "CFO",
    title: "Chief Financial Officer",
    status: "active" as const,
    task: "Generating Q2 burn analysis…",
    ago: "now",
    color: "#30d158",
  },
  {
    id: "coo",
    acronym: "COO",
    title: "Chief Operating Officer",
    status: "active" as const,
    task: "Sprint risk assessment complete",
    ago: "4m ago",
    color: "#0a84ff",
  },
  {
    id: "cto",
    acronym: "CTO",
    title: "Chief Technology Officer",
    status: "standby" as const,
    task: "Architecture review complete",
    ago: "1d ago",
    color: "#38bdf8",
  },
  {
    id: "cpo",
    acronym: "CPO",
    title: "Chief Product Officer",
    status: "standby" as const,
    task: "Roadmap prioritization updated",
    ago: "3h ago",
    color: "#ff9f0a",
  },
  {
    id: "chro",
    acronym: "CHRO",
    title: "Chief HR Officer",
    status: "idle" as const,
    task: "Last active yesterday",
    ago: "1d ago",
    color: "#f472b6",
  },
]

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  on_track: { label: "On track", color: "text-emerald-500 dark:text-emerald-400", bar: "bg-emerald-500" },
  at_risk:  { label: "At risk",  color: "text-amber-500 dark:text-amber-400",   bar: "bg-amber-500"   },
  blocked:  { label: "Blocked",  color: "text-red-500 dark:text-red-400",       bar: "bg-red-500"     },
}

const AGENT_STATUS_CFG = {
  active:  { dot: "bg-amber-400",  pulse: true,  label: "Active"  },
  standby: { dot: "bg-emerald-400", pulse: false, label: "Standby" },
  idle:    { dot: "bg-zinc-500",   pulse: false, label: "Idle"    },
}

// ─── Stagger ──────────────────────────────────────────────────────────────────

const container = { animate: { transition: { staggerChildren: 0.04 } } }
const item = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } },
}

// ─── Live clock ───────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState("")
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--label-tertiary)" }}>
      {time}
    </span>
  )
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function Delta({ value }: { value: number }) {
  if (value === 0)
    return (
      <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--label-tertiary)" }}>
        <Minus className="size-2.5" />
      </span>
    )
  const up = value > 0
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-[10px] font-medium",
        up ? "text-red-500 dark:text-red-400" : "text-emerald-500 dark:text-emerald-400"
      )}
    >
      {up ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
      {Math.abs(value)}
    </span>
  )
}

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-0.5 rounded-full bg-border overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] tabular-nums font-mono" style={{ color: "var(--label-tertiary)" }}>
        {value}%
      </span>
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p
        className="text-[10px] font-semibold tracking-widest uppercase"
        style={{ color: "var(--label-tertiary)" }}
      >
        {children}
      </p>
      {action && (
        <Link
          href={action.href}
          className="flex items-center gap-0.5 text-[11px] transition-colors hover:text-foreground"
          style={{ color: "var(--label-tertiary)" }}
        >
          {action.label}
          <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.firstName ?? "—"

  const hour = new Date().getHours()
  const greeting =
    hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  const criticalCount = EXCEPTIONS.filter((e) => e.severity === "critical").length
  const pendingDecisions = AI_INSIGHTS.filter((i) => i.urgency === "high").length

  return (
    <motion.div
      className="flex flex-col gap-7"
      variants={container}
      initial="initial"
      animate="animate"
    >
      {/* ── Status strip ─────────────────────────────────────────────────── */}
      <motion.div
        variants={item}
        className="flex items-center justify-between pb-3 border-b"
        style={{ borderColor: "var(--separator)" }}
      >
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] tracking-wide" style={{ color: "var(--label-tertiary)" }}>
            All systems operational
          </span>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <span className="text-[10px] font-mono" style={{ color: "var(--label-quaternary)" }}>
            Taskforce OS · v1.0
          </span>
        </div>
      </motion.div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex items-end justify-between gap-4">
        <div>
          <p
            className="text-[10px] font-semibold tracking-widest uppercase mb-1"
            style={{ color: "var(--label-tertiary)" }}
          >
            {greeting}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{firstName}</h1>
        </div>

        {/* Situation summary */}
        <div className="flex items-center gap-3 pb-0.5">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/8">
              <AlertTriangle className="size-3 text-red-500 dark:text-red-400 shrink-0" />
              <span className="text-[11px] font-medium text-red-500 dark:text-red-400">
                {criticalCount} critical
              </span>
            </div>
          )}
          {pendingDecisions > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/8">
              <Zap className="size-3 text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="text-[11px] font-medium text-amber-500 dark:text-amber-400">
                {pendingDecisions} decision{pendingDecisions > 1 ? "s" : ""} pending
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Operational pulse ─────────────────────────────────────────────── */}
      <motion.div variants={item}>
        <div className="flex divide-x rounded-xl border bg-card overflow-hidden" style={{ borderColor: "var(--separator)", divideColor: "var(--separator)" }}>
          {OPERATIONAL_PULSE.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className={cn(
                "group flex-1 flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-accent/60",
                m.urgent && "bg-red-500/4 hover:bg-red-500/8"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-medium tracking-wide uppercase"
                  style={{ color: "var(--label-tertiary)" }}
                >
                  {m.label}
                </span>
                <Delta value={m.delta} />
              </div>
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums tracking-tight",
                  m.urgent && m.value > 0 && "text-red-500 dark:text-red-400"
                )}
              >
                {m.value}
              </span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* ── Left (2/3) ── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Needs Attention */}
          <AnimatePresence>
            {EXCEPTIONS.length > 0 && (
              <motion.section variants={item}>
                <SectionLabel>Needs attention</SectionLabel>
                <div className="space-y-2">
                  {EXCEPTIONS.map((ex) => (
                    <Link
                      key={ex.id}
                      href={ex.href}
                      className={cn(
                        "group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                        ex.severity === "critical"
                          ? "border-red-500/15 bg-red-500/5 hover:bg-red-500/8"
                          : "border-amber-500/15 bg-amber-500/5 hover:bg-amber-500/8"
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          "size-3.5 shrink-0 mt-0.5",
                          ex.severity === "critical"
                            ? "text-red-500 dark:text-red-400"
                            : "text-amber-500 dark:text-amber-400"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-[12px] leading-relaxed",
                            ex.severity === "critical"
                              ? "text-red-700 dark:text-red-300"
                              : "text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {ex.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-md font-mono"
                          style={{ background: "var(--fill-secondary)", color: "var(--label-tertiary)" }}
                        >
                          {ex.source}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--label-tertiary)" }}>
                          {ex.age}
                        </span>
                        <ChevronRight className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--label-tertiary)" }} />
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Active Operations */}
          <motion.section variants={item}>
            <SectionLabel action={{ label: "All operations", href: "./projects" }}>
              Active operations
            </SectionLabel>
            <div className="rounded-xl border bg-card overflow-hidden" style={{ borderColor: "var(--separator)" }}>
              {OPERATIONS.map((op, i) => {
                const st = STATUS_CFG[op.status]
                const velocityUp = op.velocity > 0
                return (
                  <Link
                    key={op.id}
                    href={op.href}
                    className={cn(
                      "group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-accent/50",
                      i < OPERATIONS.length - 1 && "border-b"
                    )}
                    style={{ borderColor: "var(--separator)" }}
                  >
                    <div className="flex-1 min-w-0 space-y-2.5">
                      {/* Name + status */}
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{op.name}</p>
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Velocity delta */}
                          <span
                            className={cn(
                              "flex items-center gap-0.5 text-[11px] font-medium",
                              velocityUp
                                ? "text-emerald-500 dark:text-emerald-400"
                                : "text-red-500 dark:text-red-400"
                            )}
                          >
                            {velocityUp ? (
                              <TrendingUp className="size-3" />
                            ) : (
                              <TrendingDown className="size-3" />
                            )}
                            {velocityUp ? "+" : ""}
                            {op.velocity}%
                          </span>
                          {/* Status */}
                          <span className={cn("text-[11px] font-medium", st.color)}>
                            {st.label}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-0.5 rounded-full bg-border overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", st.bar, "opacity-70")}
                            style={{ width: `${op.progress}%` }}
                          />
                        </div>
                        <span
                          className="text-[10px] tabular-nums shrink-0 font-mono"
                          style={{ color: "var(--label-tertiary)" }}
                        >
                          {op.done}/{op.total}
                        </span>
                      </div>
                    </div>

                    {/* Right metadata */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: "var(--label-tertiary)" }}
                      >
                        {op.sprint}
                      </span>
                      <div
                        className="flex items-center gap-1 text-[10px]"
                        style={{ color: "var(--label-tertiary)" }}
                      >
                        <Clock className="size-2.5" />
                        <span>{op.daysLeft}d left</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </motion.section>

          {/* AI Recommendations */}
          <motion.section variants={item}>
            <SectionLabel action={{ label: "Open cockpit", href: "./agents" }}>
              AI recommendations
            </SectionLabel>
            <div className="space-y-2.5">
              {AI_INSIGHTS.map((ins) => (
                <div
                  key={ins.id}
                  className={cn(
                    "rounded-xl border bg-card px-5 py-4 transition-colors",
                    ins.urgency === "high"
                      ? "border-amber-500/15 hover:bg-amber-500/3"
                      : "hover:bg-accent/30"
                  )}
                  style={{ borderColor: ins.urgency === "high" ? undefined : "var(--separator)" }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {/* Agent badge */}
                    <span
                      className="text-[9px] font-bold px-2 py-1 rounded-md tracking-wider shrink-0"
                      style={{
                        background: `${ins.agentColor}15`,
                        color: ins.agentColor,
                        border: `1px solid ${ins.agentColor}25`,
                      }}
                    >
                      {ins.agent}
                    </span>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "var(--label-tertiary)" }}
                    >
                      {ins.category}
                    </span>
                    {ins.urgency === "high" && (
                      <span className="ml-auto text-[10px] font-semibold text-amber-500 dark:text-amber-400 flex items-center gap-1">
                        <Zap className="size-2.5" />
                        High priority
                      </span>
                    )}
                  </div>

                  {/* Insight */}
                  <p
                    className="text-[13px] leading-relaxed mb-3"
                    style={{ color: "var(--label-secondary)" }}
                  >
                    {ins.insight}
                  </p>

                  {/* Confidence + action */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p
                        className="text-[10px] mb-1"
                        style={{ color: "var(--label-tertiary)" }}
                      >
                        Confidence
                      </p>
                      <ConfidenceBar value={ins.confidence} />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-3 text-xs shrink-0 hover:bg-accent"
                      asChild
                    >
                      <Link href={ins.href} className="flex items-center gap-1.5">
                        {ins.action}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* ── Right (1/3) ── */}
        <div className="space-y-5">

          {/* Agent Activity */}
          <motion.section variants={item}>
            <SectionLabel action={{ label: "Open", href: "./agents" }}>
              Agent activity
            </SectionLabel>
            <div
              className="rounded-xl border bg-card overflow-hidden"
              style={{ borderColor: "var(--separator)" }}
            >
              {AGENTS.map((agent, i) => {
                const s = AGENT_STATUS_CFG[agent.status]
                return (
                  <Link
                    key={agent.id}
                    href="./agents"
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50",
                      i < AGENTS.length - 1 && "border-b"
                    )}
                    style={{ borderColor: "var(--separator)" }}
                  >
                    {/* Status dot */}
                    <div className="relative size-1.5 shrink-0">
                      <div className={cn("size-1.5 rounded-full", s.dot)} />
                      {s.pulse && (
                        <div
                          className={cn(
                            "absolute inset-0 rounded-full animate-ping opacity-60",
                            s.dot
                          )}
                        />
                      )}
                    </div>

                    {/* Agent info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: agent.color }}
                        >
                          {agent.acronym}
                        </span>
                        <span
                          className="text-[10px] font-mono tabular-nums shrink-0"
                          style={{ color: "var(--label-quaternary)" }}
                        >
                          {agent.ago}
                        </span>
                      </div>
                      <p
                        className="text-[11px] truncate mt-0.5"
                        style={{ color: "var(--label-tertiary)" }}
                      >
                        {agent.task}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </motion.section>

          {/* Pending decisions */}
          <motion.section variants={item}>
            <SectionLabel>Pending decisions</SectionLabel>
            <div className="space-y-2">
              {AI_INSIGHTS.filter((i) => i.urgency === "high").map((ins) => (
                <Link
                  key={ins.id}
                  href={ins.href}
                  className="group flex items-start gap-3 rounded-xl border px-4 py-3 bg-card transition-colors hover:bg-accent/40"
                  style={{ borderColor: "var(--separator)" }}
                >
                  <div
                    className="size-5 rounded-md flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5"
                    style={{ background: `${ins.agentColor}15`, color: ins.agentColor }}
                  >
                    {ins.agent}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{ins.action}</p>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--label-tertiary)" }}
                    >
                      {ins.confidence}% confidence
                    </p>
                  </div>
                  <ChevronRight
                    className="size-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity"
                    style={{ color: "var(--label-tertiary)" }}
                  />
                </Link>
              ))}
              {AI_INSIGHTS.filter((i) => i.urgency === "high").length === 0 && (
                <div
                  className="flex items-center gap-2 rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--separator)" }}
                >
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--label-tertiary)" }}
                  >
                    No decisions pending
                  </span>
                </div>
              )}
            </div>
          </motion.section>

        </div>
      </div>
    </motion.div>
  )
}
