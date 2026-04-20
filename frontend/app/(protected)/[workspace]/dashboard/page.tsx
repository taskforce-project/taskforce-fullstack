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
import { Pod } from "@/components/ui/pod"

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
    <div className="flex items-end gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-muted to-muted/50 shadow-sm">
        <Bot className="size-4 text-muted-foreground" />
      </div>
      <div className="rounded-2xl rounded-bl-none bg-linear-to-br from-muted to-muted/50 px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
          <div className="size-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
          <div className="size-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
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
    <div className="flex w-full gap-3">
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
        placeholder="Type your message..."
        disabled={isThinking}
        className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm shadow-sm outline-none placeholder:text-muted-foreground transition-all focus:border-primary focus:shadow-md focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      />
      <Button
        size="icon"
        onClick={() => send(input)}
        disabled={!input.trim() || isThinking}
        className="size-11 shrink-0 rounded-xl shadow-md transition-all hover:shadow-lg hover:scale-105"
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
    <>
      {isEmpty ? (
        /* ─── Empty state ─── */
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-2xl bg-primary/10 blur-xl" />
            <div className="relative flex size-16 items-center justify-center rounded-2xl border-2 border-primary/20 bg-linear-to-br from-primary/10 to-primary/5">
              <Sparkles className="size-8 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Hello, {userName}! 👋</h3>
            <p className="text-sm text-muted-foreground">
              I&apos;m your workspace assistant. How can I help you today?
            </p>
          </div>

          {/* Suggestion chips */}
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => send(s.prompt)}
                className="group flex items-center gap-3 rounded-xl border border-border bg-linear-to-br from-background to-muted/30 px-4 py-3.5 text-left text-xs font-medium shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="rounded-lg bg-background p-2 shadow-sm transition-colors group-hover:bg-primary/10">
                  <s.icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <span className="truncate font-semibold">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="w-full">
            <ChatInput input={input} setInput={setInput} send={send} isThinking={isThinking} />
          </div>
        </div>
      ) : (
        /* ─── Chat mode ─── */
        <div className="flex flex-col" style={{ height: 520 }}>
          <div className="flex-1 space-y-4 overflow-y-auto px-1 py-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-linear-to-br from-muted to-muted/50 text-muted-foreground"
                  }`}
                >
                  {msg.role === "user" ? (
                    userName.charAt(0).toUpperCase()
                  ) : (
                    <Bot className="size-4" />
                  )}
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "rounded-br-none bg-primary text-primary-foreground"
                      : "rounded-bl-none bg-linear-to-br from-muted to-muted/50"
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
          <div className="border-t border-border bg-muted/30 p-4">
            <ChatInput input={input} setInput={setInput} send={send} isThinking={isThinking} />
          </div>
        </div>
      )}
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
          <Pod>
            <CopilotPanel userName={firstName} />
          </Pod>
        </div>
      </div>
    </div>
  )
}

