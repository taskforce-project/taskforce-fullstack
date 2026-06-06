"use client"

import {
  useState, useRef, useCallback, createContext,
  useContext, useMemo,
} from "react"
import { useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  useLocalRuntime, AssistantRuntimeProvider,
  ThreadPrimitive, MessagePrimitive,
  useThreadRuntime, useThread,
  type ChatModelAdapter,
} from "@assistant-ui/react"
import {
  Plus, Send, ArrowLeft, Activity,
  ChevronRight, Clock, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentId    = "ceo" | "cfo" | "coo" | "cto" | "cpo" | "chro"
type AgentStatus = "active" | "standby" | "idle"
type Mode        = "overview" | "chat"

interface Agent {
  id:          AgentId
  acronym:     string
  title:       string
  role:        string
  color:       string
  description: string
  status:      AgentStatus
  lastActive:  string
  currentTask: string
  recentOutputs: string[]
  responses:   string[]
}

// ─── Agent definitions ────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    id: "ceo", acronym: "CEO", title: "Chief Executive Officer",
    role: "Vision & Strategy", color: "#a78bfa",
    status: "standby", lastActive: "2h ago",
    currentTask: "Strategic overview updated — OKR confidence at 68%",
    description: "Strategic direction, OKRs, board alignment, and long-term vision.",
    recentOutputs: [
      "Q2 OKR review — 2 key results at risk",
      "Competitive landscape briefing",
      "Board update draft ready for review",
    ],
    responses: [
      "Based on our Q2 OKRs, confidence sits at 68%. Two key results are at risk — Revenue Target and Enterprise Acquisition. I recommend a board update this week with a revised path to 80% confidence.",
      "Strategic positioning looks solid. The main risk I'm tracking is competitive pressure from Series B players entering our market. Recommended move: accelerate enterprise outreach and lock in 3 strategic partnerships by Q3.",
      "OKR alignment across teams is 74% — acceptable but not great. Finance and Engineering are aligned, Product has two off-track KRs. I'd schedule a full leadership sync before end of sprint.",
    ],
  },
  {
    id: "cfo", acronym: "CFO", title: "Chief Financial Officer",
    role: "Finance & Runway", color: "#30d158",
    status: "active", lastActive: "now",
    currentTask: "Generating Q2 burn analysis — 3 scenarios modelled",
    description: "Cash flow, burn rate, financial forecasting, and fundraising.",
    recentOutputs: [
      "Monthly burn: $42k — down 8% MoM",
      "Runway: 14 months at current rate",
      "Q2 budget variance within 5%",
    ],
    responses: [
      "Monthly burn is $42k — down 8% from last month. Runway stands at 14 months at current rate. MRR grew 12% to $18.2k. Churn is 2.1% — within acceptable range. No immediate action needed.",
      "I've modelled three scenarios for the next 6 months. Conservative: 11 months runway. Base: 14 months. Optimistic (Series A closes): 28+ months. I recommend activating fundraising conversations now to stay ahead.",
      "Q2 budget variance is within 5%. Main overspend: cloud infra (+$3.2k). Main underspend: contractor hours (-$8k). Net positive. Want me to reallocate the surplus to marketing or keep as buffer?",
    ],
  },
  {
    id: "coo", acronym: "COO", title: "Chief Operating Officer",
    role: "Ops & Execution", color: "#0a84ff",
    status: "active", lastActive: "4m ago",
    currentTask: "Sprint risk assessment complete — 2 blockers identified",
    description: "Sprint health, team velocity, blockers, and operational excellence.",
    recentOutputs: [
      "Sprint 12 velocity down 18% — root cause identified",
      "Team workload imbalance: Eng 112%, Design 78%",
      "Deployment frequency: 2.1x/week (target 3x)",
    ],
    responses: [
      "Sprint 12 status: velocity down 18% to 42 points. Root cause: 3 critical blockers — TF-312 and TF-318 are pending external API access. Recommended action: escalate to DevOps for API credentials by Tuesday.",
      "Team workload is unbalanced. Engineering is at 112% capacity. Design is at 78%. I recommend moving 2 design tasks to buffer and pulling Lucas from non-critical research to unblock TF-312.",
      "Process health report: deployment frequency is 2.1x/week (target: 3x). Lead time for changes: 4.2 days (target: 2 days). Change failure rate: 3.1% — acceptable. Recovery time: 45min average. Main bottleneck: code review queue.",
    ],
  },
  {
    id: "cto", acronym: "CTO", title: "Chief Technology Officer",
    role: "Tech & Architecture", color: "#38bdf8",
    status: "standby", lastActive: "1d ago",
    currentTask: "Architecture review complete — 3 CVEs flagged",
    description: "Technical debt, architecture decisions, stack quality, and DevOps.",
    recentOutputs: [
      "Tech debt score: 6.2/10 — auth module flagged",
      "3 high-severity CVEs require patching this sprint",
      "Monolith scalability analysis at 10x load complete",
    ],
    responses: [
      "Tech debt score: 6.2/10. Main contributors: auth module (last refactor: 8 months ago), payment service (3 open TODOs), and the legacy CSV export (no tests). Recommend a 1-sprint tech debt sprint in cycle 6.",
      "3 dependencies have known CVEs: lodash 4.17.20 (medium), axios 0.21.1 (high), and jsonwebtoken 8.5.1 (high). The axios and jsonwebtoken ones need patching this sprint.",
      "Architecture review: the current monolith is holding up fine under current load. At 10x traffic, the auth service and file upload will bottleneck first. Recommend extracting those as the first microservices post-Series A.",
    ],
  },
  {
    id: "cpo", acronym: "CPO", title: "Chief Product Officer",
    role: "Roadmap & UX", color: "#ff9f0a",
    status: "standby", lastActive: "3h ago",
    currentTask: "Roadmap prioritization updated — Q3 plan revised",
    description: "Product roadmap, user feedback, feature prioritization, and metrics.",
    recentOutputs: [
      "Q2 commitments: 71% on track — 3 features slipped",
      "Advanced Filters: 47 upvotes, blocking 3 enterprise trials",
      "Activation funnel: 31% drop at first invite step",
    ],
    responses: [
      "Roadmap health: Q2 commitments are 71% on track. 3 features slipped to Q3 — API v2, Advanced Filters, and Team Analytics. Users are most vocal about Advanced Filters (47 upvotes). Recommend reprioritizing to top of Q3.",
      "User sentiment from 128 support tickets this month: 43% feature requests, 31% bugs, 26% questions. Top requested: CSV export with custom fields. Top bug: notification delays. Both should hit the next sprint.",
      "Activation funnel review: signup → first project: 68% (good). First project → first issue: 54% (needs work). First issue → invite teammate: 31% (critical drop). Recommend a focused onboarding experiment targeting that transition.",
    ],
  },
  {
    id: "chro", acronym: "CHRO", title: "Chief HR Officer",
    role: "Talent & Culture", color: "#f472b6",
    status: "idle", lastActive: "1d ago",
    currentTask: "Last active yesterday",
    description: "Team health, hiring pipeline, performance reviews, and culture.",
    recentOutputs: [
      "Team health score: 7.4/10 — 2 engineers flagged saturation",
      "Hiring pipeline: 3 open roles, 2 in final rounds",
      "Culture pulse: 87% mission alignment (up 8pts)",
    ],
    responses: [
      "Team health score: 7.4/10. Engagement is high (82nd percentile). Main concern: 2 engineers flagged workload saturation in the last pulse survey. Recommend a 1:1 with each this week and adjusting sprint scope.",
      "Hiring pipeline: 3 open roles. Senior Backend Engineer: 2 candidates in final round. Product Designer: 8 in screening. Growth Marketer: JD just posted. Estimated time-to-hire: 6-8 weeks across all three.",
      "Culture pulse from last month: 87% of team feels aligned with company mission (up from 79%). Communication clarity dropped 4 points — likely related to the org restructure. Recommend a company-wide sync to realign.",
    ],
  },
]

// ─── API adapter (Groq via backend SSE) ──────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

function getLastUserMessage(messages: { role: string; content: unknown[] }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === "user") {
      const parts = msg.content as { type: string; text?: string }[]
      return parts.map(p => p.text ?? "").join(" ")
    }
  }
  return ""
}

function createAdapter(workspaceSlug: string, agentPersona: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const userMessage = getLastUserMessage(
        messages as { role: string; content: { type: string; text?: string }[] }[]
      )
      const prompt = agentPersona
        ? `[You are the ${agentPersona}] ${userMessage}`
        : userMessage

      // Récupérer le token JWT depuis le localStorage (pattern du projet)
      const token = typeof window !== "undefined"
        ? (localStorage.getItem("access_token") ?? "")
        : ""

      const res = await fetch(
        `${API_BASE}/api/workspaces/${workspaceSlug}/assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: prompt }),
          signal: abortSignal,
        }
      )

      if (!res.ok || !res.body) {
        throw new Error(`Assistant API error: ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   acc     = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        // Parse SSE lines: "data: ..."
        for (const line of text.split("\n")) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") break
          if (data) {
            acc += data
            yield { content: [{ type: "text" as const, text: acc }] }
          }
        }
      }
    },
  }
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  active:  { dot: "bg-amber-400",   pulse: true,  label: "Active",  labelColor: "text-amber-400"  },
  standby: { dot: "bg-emerald-400", pulse: false, label: "Standby", labelColor: "text-emerald-400" },
  idle:    { dot: "bg-zinc-600",    pulse: false, label: "Idle",    labelColor: "text-zinc-500"   },
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AgentCtx = createContext<Agent | null>(null)
const useAgent = () => {
  const ctx = useContext(AgentCtx)
  if (!ctx) throw new Error("useAgent must be inside AgentCtx.Provider")
  return ctx
}

// ─── Chat message components ──────────────────────────────────────────────────

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <div className="max-w-[68%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed"
        style={{ background: "var(--fill-primary)", color: "var(--foreground)" }}>
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  const agent = useAgent()
  return (
    <MessagePrimitive.Root className="flex gap-3 mb-4">
      <div className="size-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
        style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}28` }}>
        {agent.acronym}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold mb-1.5" style={{ color: agent.color }}>{agent.title}</p>
        <div className="rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed"
          style={{ background: "var(--card)", borderColor: "var(--separator)" }}>
          <MessagePrimitive.Content />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function EmptyState({ agent }: { agent: Agent }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="size-14 rounded-2xl flex items-center justify-center text-lg font-bold mb-5"
        style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}28` }}>
        {agent.acronym}
      </motion.div>
      <motion.div
        initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }} className="space-y-1 mb-8">
        <p className="text-sm font-semibold">{agent.title}</p>
        <p className="text-xs max-w-[220px] mx-auto leading-relaxed"
          style={{ color: "var(--label-tertiary)" }}>{agent.description}</p>
      </motion.div>
      {/* Recent outputs preview */}
      <motion.div
        initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.14 }}
        className="w-full max-w-sm space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-2"
          style={{ color: "var(--label-quaternary)" }}>Recent outputs</p>
        {agent.recentOutputs.map((output, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-left"
            style={{ background: "var(--fill-tertiary)", border: "1px solid var(--separator)" }}>
            <Activity className="size-3 mt-0.5 shrink-0" style={{ color: agent.color, opacity: 0.7 }} />
            <span className="text-[11px] leading-relaxed" style={{ color: "var(--label-secondary)" }}>
              {output}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

function ComposerInput({ placeholder }: { placeholder: string }) {
  const [text, setText] = useState("")
  const runtime = useThreadRuntime()
  const isRunning = useThread(s => s.isRunning)
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 128)}px` }
  }, [])

  const send = useCallback(() => {
    const t = text.trim()
    if (!t || isRunning) return
    runtime.append(t)
    setText("")
    if (ref.current) ref.current.style.height = "42px"
  }, [text, isRunning, runtime])

  return (
    <div className="rounded-xl border overflow-hidden transition-all"
      style={{ background: "var(--fill-tertiary)", borderColor: "var(--separator)" }}>
      <textarea
        ref={ref} value={text} rows={1} placeholder={placeholder}
        onChange={e => { setText(e.target.value); resize() }}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
        className="w-full bg-transparent px-4 pt-3 pb-2 text-sm outline-none resize-none min-h-[42px] max-h-32 overflow-y-auto block"
        style={{ color: "var(--foreground)", height: "42px" }}
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="text-[10px] font-mono select-none" style={{ color: "var(--label-quaternary)" }}>
          ↵ send · shift+↵ newline
        </span>
        <button onClick={send} disabled={!text.trim() || isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity disabled:opacity-25"
          style={{ background: "var(--foreground)", color: "var(--background)" }}>
          <Send className="size-3" />Send
        </button>
      </div>
    </div>
  )
}

// ─── Agent Thread ─────────────────────────────────────────────────────────────

function AgentThread({ agent, visible, workspaceSlug }: { agent: Agent; visible: boolean; workspaceSlug: string }) {
  const adapter = useMemo(
    () => createAdapter(workspaceSlug, `${agent.title} (${agent.role})`),
    [workspaceSlug, agent.title, agent.role]
  )
  const runtime = useLocalRuntime(adapter)
  return (
    <div className={cn("flex flex-col h-full", visible ? "flex" : "hidden")}>
      <AgentCtx.Provider value={agent}>
        <AssistantRuntimeProvider runtime={runtime}>
          <ThreadPrimitive.Root className="flex flex-col h-full min-h-0">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-6 py-5 min-h-0 scroll-smooth">
              <ThreadPrimitive.Empty><EmptyState agent={agent} /></ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            </ThreadPrimitive.Viewport>
            <div className="shrink-0 border-t p-4" style={{ borderColor: "var(--separator)" }}>
              <ComposerInput placeholder={`Ask ${agent.title}…`} />
            </div>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </AgentCtx.Provider>
    </div>
  )
}

// ─── Overview grid ────────────────────────────────────────────────────────────

function OverviewCard({ agent, onSelect }: { agent: Agent; onSelect: () => void }) {
  const s = STATUS_CFG[agent.status]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="group rounded-xl border backdrop-blur-md p-5 flex flex-col gap-4 cursor-pointer transition-all duration-150 hover:bg-white/[0.04]"
      style={{
        background: "var(--card)",
        borderColor: "var(--separator)",
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, var(--shadow)",
      }}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}28` }}>
            {agent.acronym}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{agent.title}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--label-tertiary)" }}>{agent.role}</p>
          </div>
        </div>
        {/* Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative size-1.5">
            <div className={cn("size-1.5 rounded-full", s.dot)} />
            {s.pulse && <div className={cn("absolute inset-0 rounded-full animate-ping opacity-70", s.dot)} />}
          </div>
          <span className={cn("text-[10px] font-semibold", s.labelColor)}>{s.label}</span>
        </div>
      </div>

      {/* Current task */}
      <div className="rounded-lg px-3 py-2.5 flex items-start gap-2"
        style={{ background: "var(--fill-tertiary)", border: "1px solid var(--separator)" }}>
        {agent.status === "active"
          ? <Zap className="size-3 mt-0.5 shrink-0 text-amber-400" />
          : <Clock className="size-3 mt-0.5 shrink-0" style={{ color: "var(--label-quaternary)" }} />}
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--label-secondary)" }}>
          {agent.currentTask}
        </p>
      </div>

      {/* Recent outputs */}
      <div className="space-y-1.5">
        <p className="text-[9px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--label-quaternary)" }}>Outputs</p>
        {agent.recentOutputs.slice(0, 2).map((o, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-1.5 size-1 rounded-full shrink-0" style={{ background: agent.color, opacity: 0.5 }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--label-tertiary)" }}>{o}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] font-mono" style={{ color: "var(--label-quaternary)" }}>
          {agent.lastActive}
        </span>
        <div className="flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: agent.color }}>
          Open <ChevronRight className="size-3" />
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const params = useParams()
  const workspaceSlug = params.workspace as string
  const [selectedId, setSelectedId] = useState<AgentId | null>(null)
  const [mode, setMode] = useState<Mode>("overview")
  const selectedAgent = selectedId ? AGENTS.find(a => a.id === selectedId) ?? null : null

  function openChat(id: AgentId) {
    setSelectedId(id)
    setMode("chat")
  }

  function backToOverview() {
    setMode("overview")
    setSelectedId(null)
  }

  return (
    <div className="-mx-6 -my-6 md:-mx-8 md:-my-8 flex overflow-hidden"
      style={{ height: "calc(100svh - 3.5rem)" }}>

      {/* ── Left sidebar — agent roster ─────────────────────────────── */}
      <nav className="w-56 shrink-0 border-r flex flex-col overflow-hidden"
        style={{
          borderColor: "var(--separator)",
          background: "var(--sidebar)",
          backdropFilter: "blur(24px) saturate(160%)",
        }}>

        {/* Header */}
        <div className="px-4 py-4 border-b shrink-0" style={{ borderColor: "var(--separator)" }}>
          <p className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--label-tertiary)" }}>Agent Suite</p>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto py-2">
          {AGENTS.map(agent => {
            const s   = STATUS_CFG[agent.status]
            const active = selectedId === agent.id && mode === "chat"
            return (
              <button
                key={agent.id}
                onClick={() => openChat(agent.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg transition-all duration-150 text-left",
                  active ? "bg-white/10" : "hover:bg-white/[0.05]"
                )}
                style={{ width: "calc(100% - 8px)" }}
              >
                {/* Avatar */}
                <div className="size-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}${active ? "40" : "22"}` }}>
                  {agent.acronym}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12px] font-semibold truncate">{agent.acronym}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="relative size-1.5">
                        <div className={cn("size-1.5 rounded-full", s.dot)} />
                        {s.pulse && <div className={cn("absolute inset-0 rounded-full animate-ping opacity-60", s.dot)} />}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--label-tertiary)" }}>
                    {agent.role}
                  </p>
                </div>
                {active && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{ background: agent.color }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-3 border-t" style={{ borderColor: "var(--separator)" }}>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150 hover:bg-white/[0.05]"
            style={{ borderColor: "var(--separator)", color: "var(--label-tertiary)", borderStyle: "dashed" }}>
            <Plus className="size-3.5" />
            <span className="text-[11px]">Custom agent</span>
          </button>
        </div>
      </nav>

      {/* ── Right — overview or chat ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 h-[52px] border-b shrink-0"
          style={{ borderColor: "var(--separator)", background: "rgba(8,8,12,0.60)", backdropFilter: "blur(16px)" }}>

          <AnimatePresence mode="wait">
            {mode === "chat" && selectedAgent ? (
              <motion.div key="chat-header"
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.15 }}
                className="flex items-center gap-3 flex-1 min-w-0">
                <button onClick={backToOverview}
                  className="flex items-center gap-1 text-[11px] transition-opacity opacity-50 hover:opacity-100 shrink-0"
                  style={{ color: "var(--label-secondary)" }}>
                  <ArrowLeft className="size-3.5" />
                </button>
                <div className="size-6 rounded-lg flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ background: `${selectedAgent.color}18`, color: selectedAgent.color }}>
                  {selectedAgent.acronym}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate">{selectedAgent.title}</p>
                  <p className="text-[10px] truncate" style={{ color: "var(--label-tertiary)" }}>
                    {selectedAgent.role}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md"
                  style={{ background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.18)" }}>
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Online</span>
                </div>
              </motion.div>
            ) : (
              <motion.div key="overview-header"
                initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}
                className="flex items-center justify-between w-full">
                <div>
                  <p className="text-sm font-semibold">Agent Suite</p>
                  <p className="text-[10px]" style={{ color: "var(--label-tertiary)" }}>
                    {AGENTS.filter(a => a.status === "active").length} active ·{" "}
                    {AGENTS.filter(a => a.status === "standby").length} standby
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">

            {/* Overview grid */}
            {mode === "overview" && (
              <motion.div key="overview"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-5xl">
                  {AGENTS.map((agent, i) => (
                    <motion.div key={agent.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                      <OverviewCard agent={agent} onSelect={() => openChat(agent.id)} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Chat */}
            {mode === "chat" && (
              <motion.div key="chat"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full">
                {AGENTS.map(agent => (
                  <AgentThread key={agent.id} agent={agent} visible={agent.id === selectedId} workspaceSlug={workspaceSlug} />
                ))}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
