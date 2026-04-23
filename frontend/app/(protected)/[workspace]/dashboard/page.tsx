"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FolderKanban,
  UserPlus,
  Layers,
  BarChart2,
  CheckSquare,
  ListChecks,
  Send,
  Users,
  CircleDot,
  Clock,
  ArrowUpRight,
} from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Pod } from "@/components/ui/pod"
import Orb from "@/components/effects/Orb"
import { AiMatrixIcon } from "@/components/ui/ai-matrix-icon"
import { StripedPattern } from "@/components/magicui/striped-pattern"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MsgState = "writing" | "success" | "error"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  msgState?: MsgState
}

type AiState = "idle" | "thinking"

// ---------------------------------------------------------------------------
// Mock AI response — front-only, LLM to be connected later
// ---------------------------------------------------------------------------

const MOCK_RESPONSES: Record<string, string> = {
  project:
    "I'd set up your project step-by-step: define name & description, choose a template (Scrum, Kanban, or blank), invite team members, and create initial milestones. Once the AI backend is live I'll handle all that from a single message!",
  invite:
    "To invite team members I'll collect their emails, send invitations with role assignments (Admin, Member, Viewer), and notify them with a workspace link. Unlimited invites on Pro & Enterprise.",
  sprint:
    "I can plan a sprint by pulling open issues from your backlog, suggesting priorities based on complexity, assigning by team workload, and setting start/end dates. Want me to draft the next sprint?",
  report:
    "I can generate a progress report covering issues closed vs opened, team velocity, top contributors, and active blockers. Which project should I focus on?",
  task:
    "You have 7 open issues. 2 are high priority and due today: #TF-41 and #TF-43. I'd suggest tackling #TF-41 first — it's blocking 3 others. Want me to reprioritize your queue?",
  bulk:
    "I can create issues in bulk from a description, CSV, or a Markdown checklist. Just paste your list and I'll parse it into structured issues with titles, descriptions, and suggested labels.",
}

function simulateResponse(input: string): string {
  const lower = input.toLowerCase()
  for (const [key, response] of Object.entries(MOCK_RESPONSES)) {
    if (lower.includes(key)) return response
  }
  return "Great question! Once the AI backend is connected I'll give you a precise and actionable answer. For now I'm in preview mode — but keep asking, this is exactly what I'll be able to do!"
}

// ---------------------------------------------------------------------------
// Chat sub-components
// ---------------------------------------------------------------------------


const SUGGESTIONS = [
  { label: "Init a new project", icon: FolderKanban, prompt: "Help me initialize a new project with my team" },
  { label: "Invite team members", icon: UserPlus, prompt: "I want to invite team members to the workspace" },
  { label: "Plan a sprint", icon: Layers, prompt: "Help me plan and create a new sprint" },
  { label: "Generate a report", icon: BarChart2, prompt: "Generate a progress report for my projects" },
  { label: "Review my tasks", icon: CheckSquare, prompt: "Show me my open tasks and help me prioritize" },
  { label: "Create issues in bulk", icon: ListChecks, prompt: "I need to create multiple issues for a project" },
] as const

// ---------------------------------------------------------------------------
// Orb keyframes — injected once at module level
// ---------------------------------------------------------------------------

const ORB_KEYFRAMES = `
  @keyframes micro-bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
  @keyframes status-pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
`

function ThinkingDots() {
  return (
    <div className="flex items-end gap-3">
      <AiMatrixIcon mode="thinking" size={3} />
      <div className="rounded-tl-sm rounded-tr-2xl rounded-br-2xl rounded-bl-2xl border border-border bg-muted px-4 py-3 flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="size-1.5 rounded-full bg-muted-foreground/50"
            style={{ animation: "micro-bounce 0.8s ease-in-out infinite", animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat input bar
// ---------------------------------------------------------------------------

interface ChatInputProps {
  readonly input: string
  readonly setInput: (v: string) => void
  readonly send: (text: string) => void
  readonly isThinking: boolean
}

function ChatInput({ input, setInput, send, isThinking }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  const canSend = input.trim() !== "" && !isThinking

  return (
    <div
      className="rounded-xl border bg-card overflow-hidden transition-colors focus-within:border-foreground/20"
      style={{ borderColor: isThinking ? "rgba(255,174,4,0.3)" : undefined }}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send(input)
          }
        }}
        placeholder="Ask me anything about your workspace…"
        disabled={isThinking}
        rows={1}
        className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none min-h-11 max-h-30 overflow-y-auto disabled:opacity-40"
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="text-[10px] text-muted-foreground/40 font-mono">Shift+Enter for new line</span>
        <button
          type="button"
          onClick={() => send(input)}
          disabled={!canSend}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
            canSend
              ? "bg-foreground text-background hover:opacity-80 cursor-pointer"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          <Send className="size-3" />
          Send
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copilot panel — self-contained dark card
// ---------------------------------------------------------------------------

interface CopilotPanelProps {
  readonly userName: string
}

interface HeroStateProps {
  readonly userName: string
  readonly isThinking: boolean
  readonly input: string
  readonly setInput: (v: string) => void
  readonly send: (text: string) => void
}

// Shadow palette hue-rotate offsets (degrees) applied on Orb canvas — purple→pink→orange→red→amber
const ORB_SHADOW_HUES = [0, 60, 120, 70, 135] as const

function HeroState({ userName, isThinking, input, setInput, send }: HeroStateProps) {
  const [hueIdx, setHueIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setHueIdx((i) => (i + 1) % ORB_SHADOW_HUES.length), 2500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center gap-6 pt-8 pb-4 relative overflow-hidden">
      {/* Striped background — same as 404 page */}
      <StripedPattern direction="left" width={28} height={28} className="text-muted-foreground/8" />
      {/* Radial fade to hide stripes toward center */}
      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_85%_75%_at_50%_40%,transparent_15%,hsl(var(--card))_70%)]" />

      {/* Content above the bg layers */}
      <div className="relative z-30 flex flex-col items-center gap-6 w-full">
        {/* Orb — brand mark, cycles through shadow palette colors */}
        <div
          style={{
            width: 96,
            height: 96,
            filter: `hue-rotate(${ORB_SHADOW_HUES[hueIdx]}deg)`,
            transition: "filter 1.5s ease",
          }}
        >
          <Orb hue={0} hoverIntensity={0.5} forceHoverState={input.length > 0} backgroundColor="#090909" />
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5 max-w-xs">
          <h3 className="text-lg font-semibold tracking-tight">Hi, {userName}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your agentic workspace AI. Plan sprints, manage issues, generate reports.
          </p>
        </div>

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => send(s.prompt)}
              disabled={isThinking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-transparent text-muted-foreground text-xs hover:border-foreground/25 hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <s.icon className="size-3 shrink-0" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="w-full">
          <ChatInput input={input} setInput={setInput} send={send} isThinking={isThinking} />
        </div>
      </div>
    </div>
  )
}

function CopilotPanel({ userName }: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [aiState, setAiState] = useState<AiState>("idle")
  const bottomRef = useRef<HTMLDivElement>(null)

  const isThinking = aiState === "thinking"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, aiState])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || aiState === "thinking") return
      const userMsg: ChatMessage = { id: Math.random().toString(36).slice(2), role: "user", content: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      setAiState("thinking")
      setTimeout(() => {
        const assistantMsg: ChatMessage = {
          id: Math.random().toString(36).slice(2),
          role: "assistant",
          content: simulateResponse(trimmed),
          msgState: "success",
        }
        setMessages((prev) => [...prev, assistantMsg])
        setAiState("idle")
      }, 1200 + Math.random() * 800)
    },
    [aiState],
  )

  const isEmpty = messages.length === 0

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORB_KEYFRAMES }} />
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col" style={{ minHeight: 540 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <AiMatrixIcon mode={isThinking ? "thinking" : "idle"} size={3} color="#ffae04" />
            <div>
              <p className="text-sm font-semibold">Taskforce AI</p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{
                    background: isThinking ? "#ffae04" : "#22c55e",
                    boxShadow: isThinking ? "0 0 5px #ffae04" : "0 0 5px #22c55e",
                    animation: "status-pulse 2s ease-in-out infinite",
                    transition: "background 0.4s, box-shadow 0.4s",
                  }}
                />
                {isThinking ? "Processing…" : "Ready"}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-widest border border-border px-2 py-1 rounded-md">
            Preview
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-5 pb-5">
          {isEmpty ? (
            <HeroState userName={userName} isThinking={isThinking} input={input} setInput={setInput} send={send} />
          ) : (
            <div className="flex-1 flex flex-col pt-5 gap-4">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 min-h-0 max-h-90">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {msg.role === "assistant" ? (
                      <AiMatrixIcon mode={msg.msgState ?? "writing"} size={3} />
                    ) : (
                      <div className="size-7 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold">
                        {userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-foreground text-background rounded-tl-2xl rounded-tr-sm rounded-br-2xl rounded-bl-2xl"
                          : "bg-muted text-foreground border border-border rounded-tl-sm rounded-tr-2xl rounded-br-2xl rounded-bl-2xl"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isThinking && <ThinkingDots />}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="mt-2">
                <ChatInput input={input} setInput={setInput} send={send} isThinking={isThinking} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Static placeholder data
// ---------------------------------------------------------------------------

const STATS = [
  { label: "Active Projects", value: 4, icon: FolderKanban, href: "/projects" },
  { label: "Open Issues", value: 18, icon: CircleDot, href: "/projects" },
  { label: "My Tasks", value: 7, icon: CheckSquare, href: "/my-work/issues" },
  { label: "Members", value: 12, icon: Users, href: "/members" },
] as const

const ACTIVITY = [
  { id: "1", initials: "AM", name: "Alice Martin", action: "closed", target: "#TF-42 Fix login redirect", time: "5m" },
  { id: "2", initials: "BC", name: "Bob Chen", action: "created project", target: "Mobile App v2", time: "1h" },
  { id: "3", initials: "CD", name: "Camille Dupont", action: "started cycle", target: "Sprint 8 — Backend", time: "2h" },
  { id: "4", initials: "DK", name: "David Kim", action: "commented on", target: "#TF-38 Analytics", time: "3h" },
] as const

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
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting}, <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">{firstName}</span>
        </h1>
        <p className="text-base text-muted-foreground">
          Here&apos;s what&apos;s happening in your workspace
        </p>
      </div>

      {/* Main grid layout - pods system */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Stats + Activity */}
        <div className="space-y-6 lg:col-span-1">
          {/* Stats Pod */}
          <Pod title="Workspace overview" description="Quick stats at a glance">
            <div className="space-y-3">
              {STATS.map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="group flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3.5 text-sm transition-all hover:border-primary/40 hover:bg-muted/50 hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-muted p-2 transition-colors group-hover:bg-primary/10">
                      <stat.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                    </div>
                    <span className="font-medium text-muted-foreground group-hover:text-foreground">{stat.label}</span>
                  </div>
                  <span className="text-xl font-bold">{stat.value}</span>
                </Link>
              ))}
            </div>
          </Pod>

          {/* Activity Pod */}
          <Pod
            title="Recent activity"
            action={
              <Button variant="ghost" size="sm" className="h-auto px-3 py-1.5 text-xs font-medium" asChild>
                <Link href="/inbox" className="flex items-center gap-1.5">
                  View all <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            }
          >
            <div className="space-y-3">
              {ACTIVITY.map((event) => (
                <div key={event.id} className="group flex items-start gap-3 rounded-lg border border-border bg-background p-3 transition-all hover:border-primary/30 hover:bg-muted/30">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs font-medium">{event.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1.5">
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

        {/* Right column - Copilot Chat */}
        <div className="lg:col-span-2">
          <CopilotPanel userName={firstName} />
        </div>
      </div>
    </div>
  )
}

