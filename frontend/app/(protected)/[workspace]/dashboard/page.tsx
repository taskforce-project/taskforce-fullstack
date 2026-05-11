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
  on_track: { label: "On track", text: "text-emerald-400", bar: "bg-emerald-500" },
  at_risk:  { label: "At risk",  text: "text-amber-400",  bar: "bg-amber-500"  },
  blocked:  { label: "Blocked",  text: "text-red-400",    bar: "bg-red-500"    },
}
const AGENT_DOT = {
  active:  { dot: "bg-amber-400",   pulse: true  },
  standby: { dot: "bg-emerald-400", pulse: false },
  idle:    { dot: "bg-zinc-600",    pulse: false },
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
  return <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--label-quaternary)" }}>{t}</span>
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <Minus className="size-2.5" style={{ color: "var(--label-quaternary)" }} />
  const up = value > 0
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px] font-semibold", up ? "text-red-400" : "text-emerald-400")}>
      {up ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}{Math.abs(value)}
    </span>
  )
}

function ConfBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: "var(--fill-secondary)" }}>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--label-tertiary)" }}>{value}%</span>
    </div>
  )
}

function SectionLabel({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--label-tertiary)" }}>
        {children}
      </p>
      {href && (
        <Link href={href} className="flex items-center gap-0.5 text-[11px] transition-opacity opacity-50 hover:opacity-100"
          style={{ color: "var(--label-secondary)" }}>
          View all <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

/* The core Raycast glass card — transparent background, blur, barely-there border */
function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded-xl border backdrop-blur-md", className)}
      style={{
        background: "var(--card)",
        borderColor: "var(--separator)",
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, var(--shadow)",
        ...style,
      }}
    >
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
      <motion.div variants={row} className="flex items-center justify-between pb-3"
        style={{ borderBottom: "1px solid var(--separator)" }}>
        <div className="flex items-center gap-2">
          {/* Glow dot — Raycast-style indicator */}
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex rounded-full size-2 bg-emerald-400" />
          </span>
          <span className="text-[11px]" style={{ color: "var(--label-tertiary)" }}>All systems operational</span>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <span className="text-[10px] font-mono" style={{ color: "var(--label-quaternary)" }}>Taskforce OS · v1.0</span>
        </div>
      </motion.div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.div variants={row} className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-1"
            style={{ color: "var(--label-tertiary)" }}>{greeting}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{firstName}</h1>
        </div>

        <div className="flex items-center gap-2 pb-0.5">
          {criticals > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.22)" }}>
              <AlertTriangle className="size-3 text-red-400 shrink-0" />
              <span className="text-[11px] font-semibold text-red-400">{criticals} critical</span>
            </div>
          )}
          {decisions > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <Zap className="size-3 shrink-0" style={{ color: "#a78bfa" }} />
              <span className="text-[11px] font-semibold" style={{ color: "#a78bfa" }}>
                {decisions} decision{decisions > 1 ? "s" : ""} pending
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Operational pulse ─────────────────────────────────────────── */}
      <motion.div variants={row}>
        <Card className="flex overflow-hidden divide-x" style={{ divideColor: "var(--separator)" } as React.CSSProperties}>
          {PULSE.map(m => (
            <Link key={m.id} href={m.href}
              className="group flex-1 flex flex-col gap-2.5 px-5 py-4 transition-all duration-150 hover:bg-white/[0.04]"
              style={m.urgent && m.value > 0 ? { background: "rgba(255,69,58,0.07)" } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--label-tertiary)" }}>{m.label}</span>
                <Delta value={m.delta} />
              </div>
              <span className={cn("text-[22px] font-semibold tabular-nums tracking-tight leading-none",
                m.urgent && m.value > 0 ? "text-red-400" : "text-foreground")}>
                {m.value}
              </span>
            </Link>
          ))}
        </Card>
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
                    <Link key={ex.id} href="./projects"
                      className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-150"
                      style={{
                        background:   ex.severity === "critical" ? "rgba(255,69,58,0.09)"   : "rgba(255,159,10,0.09)",
                        border: `1px solid ${ex.severity === "critical" ? "rgba(255,69,58,0.22)"  : "rgba(255,159,10,0.22)"}`,
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <AlertTriangle className={cn("size-3.5 shrink-0", ex.severity === "critical" ? "text-red-400" : "text-amber-400")} />
                      <p className={cn("flex-1 text-[12px] leading-relaxed font-medium",
                        ex.severity === "critical" ? "text-red-300" : "text-amber-300")}>{ex.message}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                          style={{ background: "var(--fill-secondary)", color: "var(--label-tertiary)" }}>{ex.source}</span>
                        <span className="text-[10px] font-mono" style={{ color: "var(--label-quaternary)" }}>{ex.age}</span>
                        <ChevronRight className="size-3 opacity-0 group-hover:opacity-50 transition-opacity"
                          style={{ color: "var(--label-tertiary)" }} />
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
                  <Link key={op.id} href={`./projects/${op.id}`}
                    className={cn("group flex items-center gap-5 px-5 py-4 transition-all duration-150 hover:bg-white/[0.04]",
                      i < OPERATIONS.length - 1 && "border-b")}
                    style={{ borderColor: "var(--separator)" }}>
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
                        <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: "var(--fill-secondary)" }}>
                          <div className={cn("h-full rounded-full", st.bar, "opacity-80")}
                            style={{ width: `${op.progress}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums font-mono shrink-0"
                          style={{ color: "var(--label-tertiary)" }}>{op.done}/{op.total}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono" style={{ color: "var(--label-tertiary)" }}>{op.sprint}</span>
                      <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--label-quaternary)" }}>
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
                <div key={ins.id}
                  className="rounded-xl border backdrop-blur-md px-5 py-4 transition-all duration-150 hover:bg-white/[0.03]"
                  style={{
                    background:   ins.urgency === "high" ? "rgba(167,139,250,0.07)" : "var(--card)",
                    borderColor:  ins.urgency === "high" ? "rgba(167,139,250,0.22)" : "var(--separator)",
                    boxShadow:    ins.urgency === "high"
                      ? "0 0 0 1px rgba(167,139,250,0.08) inset, var(--shadow)"
                      : "0 1px 0 0 rgba(255,255,255,0.04) inset, var(--shadow)",
                  }}>
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-[9px] font-bold px-2 py-1 rounded-md tracking-widest uppercase"
                      style={{ background: `${ins.agentColor}1a`, color: ins.agentColor, border: `1px solid ${ins.agentColor}30` }}>
                      {ins.agent}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--label-tertiary)" }}>{ins.category}</span>
                    {ins.urgency === "high" && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#a78bfa" }}>
                        <Zap className="size-2.5" />AI priority
                      </span>
                    )}
                  </div>
                  {/* Insight */}
                  <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--label-secondary)" }}>
                    {ins.insight}
                  </p>
                  {/* Footer */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-[9px] uppercase tracking-widest mb-1.5 font-semibold"
                        style={{ color: "var(--label-quaternary)" }}>Confidence</p>
                      <ConfBar value={ins.confidence} />
                    </div>
                    <Button variant="ghost" size="sm"
                      className="h-7 px-3 text-xs shrink-0 rounded-lg border hover:bg-white/8"
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
              {AGENTS.map((agent, i) => {
                const d = AGENT_DOT[agent.status]
                return (
                  <Link key={agent.id} href="./agents"
                    className={cn("group flex items-center gap-3 px-4 py-3 transition-all duration-150 hover:bg-white/[0.04]",
                      i < AGENTS.length - 1 && "border-b")}
                    style={{ borderColor: "var(--separator)" }}>
                    <div className="relative size-1.5 shrink-0">
                      <div className={cn("size-1.5 rounded-full", d.dot)} />
                      {d.pulse && <div className={cn("absolute inset-0 rounded-full animate-ping opacity-70", d.dot)} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold" style={{ color: agent.color }}>{agent.acronym}</span>
                        <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--label-quaternary)" }}>{agent.ago}</span>
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--label-tertiary)" }}>{agent.task}</p>
                    </div>
                  </Link>
                )
              })}
            </Card>
          </motion.section>

          {/* Pending Decisions */}
          <motion.section variants={row}>
            <SectionLabel>Pending decisions</SectionLabel>
            <div className="space-y-1.5">
              {AI_INSIGHTS.filter(i => i.urgency === "high").map(ins => (
                <Link key={ins.id} href={ins.href}
                  className="group flex items-start gap-3 rounded-xl border px-4 py-3 backdrop-blur-md transition-all duration-150 hover:bg-white/[0.04]"
                  style={{ background: "var(--card)", borderColor: "var(--separator)" }}>
                  <div className="size-5 rounded-md flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5"
                    style={{ background: `${ins.agentColor}18`, color: ins.agentColor }}>
                    {ins.agent}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{ins.action}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--label-tertiary)" }}>{ins.confidence}% confidence</p>
                  </div>
                  <ChevronRight className="size-3 shrink-0 mt-1 opacity-0 group-hover:opacity-40 transition-opacity" />
                </Link>
              ))}
              {AI_INSIGHTS.filter(i => i.urgency === "high").length === 0 && (
                <div className="flex items-center gap-2 rounded-xl border px-4 py-3 backdrop-blur-md"
                  style={{ background: "var(--card)", borderColor: "var(--separator)" }}>
                  <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[12px]" style={{ color: "var(--label-tertiary)" }}>No decisions pending</span>
                </div>
              )}
            </div>
          </motion.section>

        </div>
      </div>
    </motion.div>
  )
}
