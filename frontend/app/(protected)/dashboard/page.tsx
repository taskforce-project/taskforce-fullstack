"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Sparkles,
  FolderKanban,
  UserPlus,
  Layers,
  BarChart2,
  CheckSquare,
  ListChecks,
  Send,
  Bot,
  Users,
  CircleDot,
  Clock,
  ArrowUpRight,
} from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

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

function ThinkingDots() {
  return (
    <div className="flex items-end gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-3.5 text-muted-foreground" />
      </div>
      <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
          <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
          <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

interface ChatInputProps {
  readonly input: string
  readonly setInput: (v: string) => void
  readonly send: (text: string) => void
  readonly isThinking: boolean
}

function ChatInput({ input, setInput, send, isThinking }: ChatInputProps) {
  return (
    <div className="flex w-full gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send(input)
          }
        }}
        placeholder="Ask anything about your workspace..."
        disabled={isThinking}
        className="h-10 flex-1 rounded-xl border border-border/60 bg-background/60 px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background disabled:opacity-60"
      />
      <Button
        size="icon"
        onClick={() => send(input)}
        disabled={!input.trim() || isThinking}
        className="size-10 shrink-0 rounded-xl"
      >
        <Send className="size-4" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copilot panel
// ---------------------------------------------------------------------------

interface CopilotPanelProps {
  readonly userName: string
}

function CopilotPanel({ userName }: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isThinking])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isThinking) return

      const userMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: "user",
        content: trimmed,
      }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      setIsThinking(true)

      setTimeout(
        () => {
          const assistantMsg: ChatMessage = {
            id: Math.random().toString(36).slice(2),
            role: "assistant",
            content: simulateResponse(trimmed),
          }
          setMessages((prev) => [...prev, assistantMsg])
          setIsThinking(false)
        },
        1200 + Math.random() * 800,
      )
    },
    [isThinking],
  )

  const isEmpty = messages.length === 0

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl [box-shadow:var(--shadow-xl)]">
      {/* Gradient glow overlay */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-violet-500/5 via-transparent to-pink-500/5" />

      {isEmpty ? (
        /* ─── Empty state ─── */
        <div className="relative flex flex-col items-center gap-5 px-6 pb-6 pt-10 text-center sm:px-12">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-border/50 bg-linear-to-br from-violet-500/20 to-pink-500/20 [box-shadow:var(--shadow-lg)]">
            <Sparkles className="size-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              What can I help you with, {userName}?
            </h2>
            <p className="text-sm text-muted-foreground">
              Ask me anything about your projects, team or tasks
            </p>
          </div>

          {/* Suggestion chips */}
          <div className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.prompt)}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 text-left text-xs font-medium transition-all hover:border-primary/40 hover:bg-accent"
              >
                <s.icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="w-full max-w-lg">
            <ChatInput input={input} setInput={setInput} send={send} isThinking={isThinking} />
          </div>
        </div>
      ) : (
        /* ─── Chat mode ─── */
        <div className="relative flex flex-col" style={{ height: 460 }}>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {msg.role === "user" ? (
                    userName.charAt(0).toUpperCase()
                  ) : (
                    <Bot className="size-3.5" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isThinking && <ThinkingDots />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-border/40 p-3">
            <ChatInput input={input} setInput={setInput} send={send} isThinking={isThinking} />
          </div>
        </div>
      )}
    </div>
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

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Good morning, <span className="text-primary">{firstName}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your workspace.
        </p>
      </div>

      {/* Copilot hero */}
      <CopilotPanel userName={firstName} />

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2">
        {STATS.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/60 px-4 py-2 text-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card"
          >
            <stat.icon className="size-3.5 text-muted-foreground" />
            <span className="font-semibold">{stat.value}</span>
            <span className="text-muted-foreground">{stat.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </h2>
          <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" asChild>
            <Link href="/inbox" className="flex items-center gap-1">
              View all <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
        <div className="divide-y divide-border/40 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm">
          {ACTIVITY.map((event) => (
            <div key={event.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="text-xs">{event.initials}</AvatarFallback>
              </Avatar>
              <p className="flex-1 min-w-0 text-sm">
                <span className="font-medium">{event.name}</span>{" "}
                <span className="text-muted-foreground">{event.action}</span>{" "}
                <span className="font-medium">{event.target}</span>
              </p>
              <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {event.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

