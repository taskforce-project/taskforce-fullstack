"use client"

import { useState, useRef, useCallback, createContext, useContext, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  useLocalRuntime,
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  useThreadRuntime,
  useThread,
  type ChatModelAdapter,
  type ChatModelRunOptions,
} from "@assistant-ui/react"
import { Plus, MoreHorizontal, Send, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
type AgentId = "ceo" | "cfo" | "coo" | "cto" | "cpo" | "chro"

interface Agent {
  id: AgentId
  acronym: string
  title: string
  role: string
  color: string
  description: string
  responses: string[]
}

// ─── Agent definitions ────────────────────────────────────────────────────────
const AGENTS: Agent[] = [
  {
    id: "ceo",
    acronym: "CEO",
    title: "Chief Executive Officer",
    role: "Vision & Strategy",
    color: "#a78bfa",
    description: "Strategic direction, OKRs, board alignment, and long-term vision.",
    responses: [
      "Based on our Q2 OKRs, confidence sits at 68%. Two key results are at risk — Revenue Target and Enterprise Acquisition. I recommend a board update this week with a revised path to 80% confidence.",
      "Strategic positioning looks solid. The main risk I'm tracking is competitive pressure from Series B players entering our market. Recommended move: accelerate enterprise outreach and lock in 3 strategic partnerships by Q3.",
      "OKR alignment across teams is 74% — acceptable but not great. Finance and Engineering are aligned, Product has two off-track KRs. I'd schedule a full leadership sync before end of sprint.",
    ],
  },
  {
    id: "cfo",
    acronym: "CFO",
    title: "Chief Financial Officer",
    role: "Finance & Runway",
    color: "#34d399",
    description: "Cash flow, burn rate, financial forecasting, and fundraising.",
    responses: [
      "Monthly burn is $42k — down 8% from last month. Runway stands at 14 months at current rate. MRR grew 12% to $18.2k. Churn is 2.1% — within acceptable range. No immediate action needed.",
      "I've modeled three scenarios for the next 6 months. Conservative: 11 months runway. Base: 14 months. Optimistic (Series A closes): 28+ months. I recommend activating fundraising conversations now to stay ahead.",
      "Q2 budget variance is within 5%. Main overspend: cloud infra (+$3.2k). Main underspend: contractor hours (-$8k). Net positive. Want me to reallocate the surplus to marketing or keep as buffer?",
    ],
  },
  {
    id: "coo",
    acronym: "COO",
    title: "Chief Operating Officer",
    role: "Ops & Execution",
    color: "#818cf8",
    description: "Sprint health, team velocity, blockers, and operational excellence.",
    responses: [
      "Sprint 12 status: velocity down 18% to 42 points. Root cause: 3 critical blockers — TF-312 and TF-318 are pending external API access. Recommended action: escalate to DevOps for API credentials by Tuesday.",
      "Team workload is unbalanced. Engineering is at 112% capacity. Design is at 78%. I recommend moving 2 design tasks to buffer and pulling Lucas from non-critical research to unblock TF-312.",
      "Process health report: deployment frequency is 2.1x/week (target: 3x). Lead time for changes: 4.2 days (target: 2 days). Change failure rate: 3.1% — acceptable. Recovery time: 45min average. Main bottleneck: code review queue.",
    ],
  },
  {
    id: "cto",
    acronym: "CTO",
    title: "Chief Technology Officer",
    role: "Tech & Architecture",
    color: "#38bdf8",
    description: "Technical debt, architecture decisions, stack quality, and DevOps.",
    responses: [
      "Tech debt score: 6.2/10. Main contributors: auth module (last refactor: 8 months ago), payment service (3 open TODOs), and the legacy CSV export (no tests). Recommend a 1-sprint tech debt sprint in cycle 6.",
      "3 dependencies have known CVEs: lodash 4.17.20 (medium), axios 0.21.1 (high), and jsonwebtoken 8.5.1 (high). The axios and jsonwebtoken ones need patching this sprint.",
      "Architecture review: the current monolith is holding up fine under current load. At 10x traffic, the auth service and file upload will bottleneck first. Recommend extracting those as the first microservices post-Series A.",
    ],
  },
  {
    id: "cpo",
    acronym: "CPO",
    title: "Chief Product Officer",
    role: "Roadmap & UX",
    color: "#fb923c",
    description: "Product roadmap, user feedback, feature prioritization, and metrics.",
    responses: [
      "Roadmap health: Q2 commitments are 71% on track. 3 features slipped to Q3 — API v2, Advanced Filters, and Team Analytics. Users are most vocal about Advanced Filters (47 upvotes). Recommend reprioritizing to top of Q3.",
      "User sentiment from 128 support tickets this month: 43% feature requests, 31% bugs, 26% questions. Top requested: CSV export with custom fields. Top bug: notification delays. Both should hit the next sprint.",
      "Activation funnel review: signup → first project: 68% (good). First project → first issue: 54% (needs work). First issue → invite teammate: 31% (critical drop). Recommend a focused onboarding experiment targeting that transition.",
    ],
  },
  {
    id: "chro",
    acronym: "CHRO",
    title: "Chief HR Officer",
    role: "Talent & Culture",
    color: "#f472b6",
    description: "Team health, hiring pipeline, performance reviews, and culture.",
    responses: [
      "Team health score: 7.4/10. Engagement is high (82nd percentile). Main concern: 2 engineers flagged workload saturation in the last pulse survey. Recommend a 1:1 with each this week and adjusting sprint scope.",
      "Hiring pipeline: 3 open roles. Senior Backend Engineer: 2 candidates in final round. Product Designer: 8 in screening. Growth Marketer: JD just posted. Estimated time-to-hire: 6-8 weeks across all three.",
      "Culture pulse from last month: 87% of team feels aligned with company mission (up from 79%). Communication clarity dropped 4 points — likely related to the org restructure. Recommend a company-wide sync to realign.",
    ],
  },
]

// ─── Mock streaming adapter ───────────────────────────────────────────────────
function getAgentResponse(agentId: AgentId, messages: ChatModelRunOptions["messages"]): string {
  const agent = AGENTS.find((a) => a.id === agentId) ?? AGENTS[2]
  const userCount = messages.filter((m) => m.role === "user").length
  const idx = Math.max(0, userCount - 1) % agent.responses.length
  return agent.responses[idx]
}

function createAdapter(agentId: AgentId): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      await new Promise<void>((r) => setTimeout(r, 500))
      if (abortSignal.aborted) return
      const text = getAgentResponse(agentId, messages)
      const words = text.split(" ")
      let accumulated = ""
      for (const word of words) {
        if (abortSignal.aborted) return
        accumulated += (accumulated ? " " : "") + word
        yield { content: [{ type: "text" as const, text: accumulated }] }
        await new Promise<void>((r) => setTimeout(r, 28))
      }
    },
  }
}

// ─── UserMessage ──────────────────────────────────────────────────────────────
function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-5">
      <div className="max-w-[65%] rounded-2xl rounded-tr-sm bg-foreground text-background px-4 py-2.5 text-sm leading-relaxed">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── AgentEmptyState ─────────────────────────────────────────────────────────
function AgentEmptyState({ agent }: { readonly agent: Agent }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 py-16 text-center select-none">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="size-14 rounded-2xl flex items-center justify-center text-lg font-bold mb-4"
        style={{ backgroundColor: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}30` }}
      >
        {agent.acronym}
      </motion.div>
      <motion.div
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="space-y-1 mb-6"
      >
        <p className="text-sm font-semibold text-foreground">{agent.title}</p>
        <p className="text-xs text-muted-foreground max-w-60 mx-auto leading-relaxed">{agent.description}</p>
      </motion.div>
      <motion.div
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.16 }}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50"
      >
        <Sparkles className="size-3" />
        <span>Start a conversation to get insights</span>
      </motion.div>
    </div>
  )
}

// ─── AgentAssistantMessage — defined outside AgentThread to satisfy ESLint ────
// ─── Agent context — avoids nested component definitions ──────────────────────────
const AgentContext = createContext<Agent | null>(null)

function useAgent(): Agent {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error("useAgent must be used inside AgentContext.Provider")
  return ctx
}

// ─── AgentAssistantMessage — reads agent from context ──────────────────────
function AgentAssistantMessage() {
  const agent = useAgent()
  return (
    <MessagePrimitive.Root className="flex gap-3 mb-5">
      <div
        className="size-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
        style={{ backgroundColor: `${agent.color}18`, color: agent.color }}
      >
        {agent.acronym}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground/50 mb-1.5 font-medium">{agent.title}</p>
        <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 text-sm leading-relaxed text-foreground">
          <MessagePrimitive.Content />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── AgentComposer — custom input, sends via thread.append() ─────────────────────
function AgentComposerInput({ placeholder }: { readonly placeholder: string }) {
  const [text, setText] = useState("")
  const threadRuntime = useThreadRuntime()
  const isRunning = useThread((s) => s.isRunning)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`
    }
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isRunning) return
    threadRuntime.append(trimmed)
    setText("")
    const el = textareaRef.current
    if (el) el.style.height = "44px"
  }, [text, isRunning, threadRuntime])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden focus-within:border-foreground/25 transition-colors">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-foreground placeholder:text-muted-foreground/35 outline-none resize-none min-h-11 max-h-32 overflow-y-auto block"
        style={{ height: "44px" }}
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="text-[10px] text-muted-foreground/35 font-mono select-none">
          Enter to send · Shift+Enter for newline
        </span>
        <button
          onClick={handleSend}
          disabled={!text.trim() || isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-foreground text-background hover:opacity-75 transition-opacity cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="size-3" />
          Send
        </button>
      </div>
    </div>
  )
}

// ─── AgentThread — one runtime per agent, all 6 mounted, shown/hidden ─────────
function AgentThread({ agent, visible }: { readonly agent: Agent; readonly visible: boolean }) {
  const adapter = useMemo(() => createAdapter(agent.id), [agent.id])
  const runtime = useLocalRuntime(adapter)

  return (
    <div className={cn("flex flex-col h-full", visible ? "flex" : "hidden")}>
      <AgentContext.Provider value={agent}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="flex flex-col h-full min-h-0">
          {/* Scrollable viewport */}
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-6 py-5 min-h-0 scroll-smooth">
            <ThreadPrimitive.Empty>
              <AgentEmptyState agent={agent} />
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage: AgentAssistantMessage,
              }}
            />
          </ThreadPrimitive.Viewport>

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-4">
            <AgentComposerInput placeholder={`Message ${agent.title}…`} />
          </div>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
      </AgentContext.Provider>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [selectedId, setSelectedId] = useState<AgentId>("coo")
  const selectedAgent = AGENTS.find((a) => a.id === selectedId) ?? AGENTS[2]

  return (
    // Escape the shell padding + fill full available height
    <div className="-mx-6 -my-6 md:-mx-8 md:-my-8 flex overflow-hidden" style={{ height: "calc(100svh - 3.5rem)" }}>
      {/* ── Left sidebar: agent switcher ── */}
      <nav className="w-18 shrink-0 border-r border-border flex flex-col items-center py-4 gap-1.5 bg-card/40">
        <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-widest mb-2 select-none">
          Agents
        </p>

        {AGENTS.map((agent) => {
          const isActive = selectedId === agent.id
          return (
            <motion.button
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-150 cursor-pointer"
              style={{
                backgroundColor: isActive ? `${agent.color}18` : "transparent",
                border: `1px solid ${isActive ? agent.color + "35" : "transparent"}`,
              }}
              title={`${agent.title} — ${agent.role}`}
            >
              <span className="text-[11px] font-bold" style={{ color: isActive ? agent.color : agent.color + "80" }}>
                {agent.acronym}
              </span>

              {/* Active indicator bar */}
              {isActive && (
                <motion.div
                  layoutId="agentActiveBar"
                  className="absolute -right-px top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                  style={{ backgroundColor: agent.color }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          )
        })}

        <div className="flex-1" />

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="w-11 h-11 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/60 hover:border-border/80 transition-colors cursor-pointer"
          title="Custom agent (coming soon)"
        >
          <Plus className="size-3.5" />
        </motion.button>
      </nav>

      {/* ── Right: thread area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0 bg-card/20">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              {/* Agent avatar */}
              <div
                className="size-7 rounded-lg flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ backgroundColor: `${selectedAgent.color}18`, color: selectedAgent.color }}
              >
                {selectedAgent.acronym}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{selectedAgent.title}</p>
                <p className="text-[11px] text-muted-foreground/55 leading-tight">{selectedAgent.role}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Status + overflow */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/8 border border-emerald-500/18">
              <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-500">Online</span>
            </div>
            <button className="size-7 rounded-md flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>

        {/* Thread panels — all 6 mounted, one visible */}
        <div className="flex-1 overflow-hidden">
          {AGENTS.map((agent) => (
            <AgentThread key={agent.id} agent={agent} visible={agent.id === selectedId} />
          ))}
        </div>
      </div>
    </div>
  )
}


