"use client"

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  FolderKanban,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  Plus,
  User,
  Bell,
  Zap,
  Sun,
  Moon,
  Search,
  Sparkles,
  Loader2,
  CornerDownLeft,
  ArrowLeft,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

// ─── Hook streaming IA (mock — brancher sur fetch SSE réel) ──────────────────
function useAIStream(query: string | null) {
  const [text, setText] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!query) { setText(""); setIsRunning(false); return }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const reply = [
      `Je traite votre demande : « ${query.slice(0, 80)} ».`,
      "Cette réponse sera bientôt connectée à l'API Taskforce.",
      "Je peux également vous rediriger vers la section pertinente ou vous aider à préciser votre question.",
    ].join(" ")
    const words = reply.split(" ")
    let i = 0; setText(""); setIsRunning(true)
    const tick = setInterval(() => {
      if (ac.signal.aborted || i >= words.length) {
        clearInterval(tick)
        if (!ac.signal.aborted) setIsRunning(false)
        return
      }
      setText((prev) => (prev ? `${prev} ${words[i]}` : words[i]))
      i++
    }, 40)
    return () => { ac.abort(); clearInterval(tick) }
  }, [query])

  return { text, isRunning }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CommandAction {
  id: string
  label: string
  group: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Readonly<CommandPaletteProps>) {
  const router = useRouter()
  const { setTheme } = useTheme()

  // ─── État mode IA ──────────────────────────────────────────────────────────
  const [aiMode, setAiMode] = useState(false)
  const [aiInput, setAiInput] = useState("")
  const [aiQuery, setAiQuery] = useState<string | null>(null)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  const { text: aiText, isRunning } = useAIStream(aiQuery)

  // Reset à chaque ouverture/fermeture
  useEffect(() => {
    if (!open) {
      setAiMode(false)
      setAiInput("")
      setAiQuery(null)
    }
  }, [open])

  // Focus textarea en mode IA
  useEffect(() => {
    if (aiMode) setTimeout(() => aiInputRef.current?.focus(), 50)
  }, [aiMode])

  function enterAiMode() { setAiMode(true); setAiInput(""); setAiQuery(null) }
  function exitAiMode() { setAiMode(false); setAiInput(""); setAiQuery(null) }

  const handleAiKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const q = aiInput.trim()
      if (q && !isRunning) setAiQuery(q)
    }
    if (e.key === "Escape") { if (aiQuery) { setAiQuery(null); setAiInput("") } else { exitAiMode() } }
  }, [aiInput, aiQuery, isRunning])

  // ─── Navigation ────────────────────────────────────────────────────────────
  function go(path: string) { router.push(path); onOpenChange(false) }

  const ACTIONS: CommandAction[] = [
    // Navigation
    { id: "dashboard",     label: "Go to Dashboard",    group: "Navigation", icon: <LayoutDashboard className="h-4 w-4" />, shortcut: "G D", action: () => go("/dashboard") },
    { id: "inbox",         label: "Go to Inbox",         group: "Navigation", icon: <Inbox className="h-4 w-4" />,           shortcut: "G I", action: () => go("/inbox") },
    { id: "my-work",       label: "Go to My Work",       group: "Navigation", icon: <ClipboardCheck className="h-4 w-4" />, shortcut: "G W", action: () => go("/my-work") },
    { id: "projects",      label: "Go to Projects",      group: "Navigation", icon: <FolderKanban className="h-4 w-4" />,   shortcut: "G P", action: () => go("/projects") },
    { id: "teams",         label: "Go to Teams",         group: "Navigation", icon: <Users className="h-4 w-4" />,           shortcut: "G T", action: () => go("/teams") },
    { id: "analytics",    label: "Go to Analytics",     group: "Navigation", icon: <BarChart3 className="h-4 w-4" />,      shortcut: "G A", action: () => go("/analytics") },
    { id: "discussions",   label: "Go to Discussions",   group: "Navigation", icon: <MessageSquare className="h-4 w-4" />,  shortcut: "G M", action: () => go("/discussions") },
    { id: "settings",      label: "Go to Settings",      group: "Navigation", icon: <Settings className="h-4 w-4" />,       shortcut: "G S", action: () => go("/settings") },
    { id: "profile",       label: "View my profile",     group: "Navigation", icon: <User className="h-4 w-4" />,           shortcut: "G F", action: () => go("/profile") },
    // Actions
    { id: "ask-ai",        label: "Ask AI",              group: "Actions",    icon: <Sparkles className="h-4 w-4" />,        shortcut: "A",   action: enterAiMode },
    { id: "new-issue",     label: "Create new issue",    group: "Actions",    icon: <Plus className="h-4 w-4" />,            shortcut: "C",   action: () => { onOpenChange(false); toast.info("New issue dialog coming soon") } },
    { id: "new-project",   label: "Create new project",  group: "Actions",    icon: <Plus className="h-4 w-4" />,                             action: () => go("/projects") },
    { id: "notifications", label: "Open notifications",  group: "Actions",    icon: <Bell className="h-4 w-4" />,                             action: () => go("/inbox") },
    { id: "upgrade",       label: "Upgrade to Pro",      group: "Actions",    icon: <Zap className="h-4 w-4" />,                              action: () => { go("/settings"); toast.info("Redirecting to Billing…") } },
    // Appearance
    { id: "theme-light",   label: "Switch to light mode", group: "Appearance", icon: <Sun className="h-4 w-4" />,    action: () => { setTheme("light"); onOpenChange(false) } },
    { id: "theme-dark",    label: "Switch to dark mode",  group: "Appearance", icon: <Moon className="h-4 w-4" />,   action: () => { setTheme("dark"); onOpenChange(false) } },
    { id: "theme-system",  label: "Use system theme",     group: "Appearance", icon: <Search className="h-4 w-4" />, action: () => { setTheme("system"); onOpenChange(false) } },
  ]

  const groups = [...new Set(ACTIONS.map((a) => a.group))]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false} className="max-w-lg overflow-hidden">
      {/* ── Mode IA ────────────────────────────────────────────────────────── */}
      {aiMode ? (
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
            <button
              onClick={exitAiMode}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">Ask AI</span>
            <span className="text-xs text-muted-foreground/50 ml-auto">ESC pour revenir</span>
          </div>

          {/* Réponse streamée */}
          {aiQuery && (
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-start gap-2.5">
                <div className="size-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  {isRunning
                    ? <Loader2 className="size-3 text-primary animate-spin" />
                    : <Sparkles className="size-3 text-primary" />
                  }
                </div>
                <p className="text-sm text-foreground leading-relaxed flex-1">
                  {aiText}
                  {isRunning && (
                    <span className="inline-block w-1 h-3.5 bg-primary/70 rounded-sm ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </div>
              {!isRunning && (
                <button
                  onClick={() => { setAiQuery(null); setAiInput("") }}
                  className="mt-2 ml-7 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  ← Nouvelle question
                </button>
              )}
            </div>
          )}

          {/* Input */}
          {!aiQuery && (
            <div className="px-4 py-3">
              <textarea
                ref={aiInputRef}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={handleAiKeyDown}
                placeholder="Posez votre question…"
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-none"
              />
              <div className="flex items-center justify-end mt-1">
                <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                  <CornerDownLeft className="size-3" /> Entrée pour envoyer
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Mode commandes (défaut) ────────────────────────────────────────── */
        <>
          <CommandInput placeholder="Search commands, pages, actions…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {groups.map((group, gi) => (
              <div key={group}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {ACTIONS.filter((a) => a.group === group).map((action) => (
                    <CommandItem key={action.id} onSelect={action.action} className="gap-3">
                      <span className={action.id === "ask-ai" ? "text-primary" : "text-muted-foreground"}>
                        {action.icon}
                      </span>
                      <span className={action.id === "ask-ai" ? "font-medium" : ""}>{action.label}</span>
                      {action.shortcut && (
                        <CommandShortcut>
                          {action.shortcut.split(" ").map((k) => (
                            <kbd
                              key={k}
                              className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              {k}
                            </kbd>
                          ))}
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </>
      )}
    </CommandDialog>
  )
}
