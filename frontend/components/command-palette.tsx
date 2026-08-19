"use client"

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  FolderKanban,
  CircleDot,
  Repeat,
  CalendarRange,
  Users,
  Activity,
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
  ArrowRight,
  Brain,
} from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { sendAssistantMessage } from "@/lib/api/assistant-service"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

// ─── Hook IA — appelle le VRAI assistant (Cortex), plus de mock ──────────────
//
// ⚠️ Ce hook renvoyait auparavant une phrase FIGÉE (« Cette réponse sera bientôt connectée à l'API »)
// avec un faux streaming mot-à-mot. C'était un mensonge servi à l'utilisateur sur le différenciateur du
// produit (règle d'or n°7). Il tape désormais l'endpoint réel via `sendAssistantMessage`, le même que
// le panneau Cortex. Pas de vrai token-streaming (le back répond en une fois) → on montre un loader
// puis la réponse. Cf. PC-029.
function useAssistant(slug: string, query: string | null) {
  const [text, setText] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query || !slug) { setText(""); setIsRunning(false); setError(null); return }
    let cancelled = false
    setText(""); setError(null); setIsRunning(true)
    sendAssistantMessage(slug, query)
      .then((answer) => { if (!cancelled) setText(answer) })
      .catch(() => { if (!cancelled) setError("The assistant is temporarily unavailable. Please try again.") })
      .finally(() => { if (!cancelled) setIsRunning(false) })
    return () => { cancelled = true }
  }, [slug, query])

  return { text, isRunning, error }
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
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const { setTheme } = useTheme()

  // ─── État mode IA ──────────────────────────────────────────────────────────
  const [aiMode, setAiMode] = useState(false)
  const [aiInput, setAiInput] = useState("")
  const [aiQuery, setAiQuery] = useState<string | null>(null)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  const { text: aiText, isRunning, error: aiError } = useAssistant(slug, aiQuery)

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
  // Les routes sont scopées au workspace (/{slug}/…) — on préfixe le slug courant. (QA Q-24)
  function go(path: string) { router.push(slug ? `/${slug}${path}` : path); onOpenChange(false) }

  const ACTIONS: CommandAction[] = [
    // Navigation
    { id: "dashboard",     label: "Go to Dashboard",    group: "Navigation", icon: <LayoutDashboard className="h-4 w-4" />, shortcut: "G D", action: () => go("/dashboard") },
    { id: "inbox",         label: "Go to Inbox",         group: "Navigation", icon: <Inbox className="h-4 w-4" />,           shortcut: "G I", action: () => go("/inbox") },
    { id: "my-work",       label: "Go to My Work",       group: "Navigation", icon: <ClipboardCheck className="h-4 w-4" />, shortcut: "G W", action: () => go("/my-work") },
    { id: "projects",      label: "Go to Projects",      group: "Navigation", icon: <FolderKanban className="h-4 w-4" />,   shortcut: "G P", action: () => go("/projects") },
    { id: "issues",        label: "Go to Issues",        group: "Navigation", icon: <CircleDot className="h-4 w-4" />,       shortcut: "G U", action: () => go("/my-work/issues") },
    { id: "cycles",        label: "Go to Cycles",        group: "Navigation", icon: <Repeat className="h-4 w-4" />,          shortcut: "G C", action: () => go("/cycles") },
    { id: "roadmap",       label: "Go to Roadmap",       group: "Navigation", icon: <CalendarRange className="h-4 w-4" />,   shortcut: "G R", action: () => go("/roadmap") },
    { id: "members",       label: "Go to Members",       group: "Navigation", icon: <Users className="h-4 w-4" />,           shortcut: "G T", action: () => go("/members") },
    { id: "settings",      label: "Go to Settings",      group: "Navigation", icon: <Settings className="h-4 w-4" />,       shortcut: "G S", action: () => go("/settings") },
    { id: "profile",       label: "View my profile",     group: "Navigation", icon: <User className="h-4 w-4" />,           shortcut: "G F", action: () => go("/profile") },
    // Labs — accès rapide aux fonctionnalités en finition. Mêmes icônes que la sidebar (Activity / Brain),
    // en couleur normale (pas de dégradé) : la carte « Labs » suffit à les signaler.
    { id: "intelligence",  label: "Intelligence",        group: "Labs",       icon: <Activity className="h-4 w-4" />, shortcut: "G A", action: () => go("/analytics") },
    { id: "brain",         label: "Brain OS",            group: "Labs",       icon: <Brain className="h-4 w-4" />,                     action: () => go("/brain") },
    // Actions
    { id: "ask-ai",        label: "Ask AI",              group: "Actions",    icon: <Sparkles className="h-4 w-4" />,        shortcut: "A",   action: enterAiMode },
    // La création d'issue est propre à un projet : on mène à la liste des projets, où chacun porte
    // son propre bouton « New issue » — plutôt qu'un dialogue de création sans projet.
    { id: "new-issue",     label: "Create issue",     group: "Actions",    icon: <Plus className="h-4 w-4" />,            shortcut: "C",   action: () => go("/projects") },
    { id: "new-project",   label: "Create project",     group: "Actions",    icon: <Plus className="h-4 w-4" />,                             action: () => { openCreateProject(); onOpenChange(false) } },
    { id: "notifications", label: "Open notifications", group: "Actions", icon: <Bell className="h-4 w-4" />,                          action: () => go("/inbox") },
    // « Voir les forfaits » → page des plans (facturation), pas les réglages génériques.
    { id: "upgrade",       label: "View plans",   group: "Actions",    icon: <Zap className="h-4 w-4" />,                              action: () => go("/billing") },
    // Appearance
    { id: "theme-light",   label: "Switch to light mode", group: "Appearance", icon: <Sun className="h-4 w-4" />,    action: () => { setTheme("light"); onOpenChange(false) } },
    { id: "theme-dark",    label: "Switch to dark mode",  group: "Appearance", icon: <Moon className="h-4 w-4" />,   action: () => { setTheme("dark"); onOpenChange(false) } },
    { id: "theme-system",  label: "Use system theme",     group: "Appearance", icon: <Search className="h-4 w-4" />, action: () => { setTheme("system"); onOpenChange(false) } },
  ]

  const groups = [...new Set(ACTIONS.map((a) => a.group))]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false} className="max-w-2xl overflow-hidden rounded-xl border shadow-2xl">
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
            <span className="text-xs text-muted-foreground/50 ml-auto">ESC to go back</span>
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
                <p className="text-sm leading-relaxed flex-1">
                  {aiError
                    ? <span className="text-destructive">{aiError}</span>
                    : <span className="text-foreground">{aiText || (isRunning ? "Thinking…" : "")}</span>}
                </p>
              </div>
              {!isRunning && (
                <button
                  onClick={() => { setAiQuery(null); setAiInput("") }}
                  className="mt-2 ml-7 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  ← New question
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
                placeholder="Ask your question…"
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-none"
              />
              <div className="flex items-center justify-end mt-1">
                <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                  <CornerDownLeft className="size-3" /> Enter to send
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
                    <CommandItem
                      key={action.id}
                      onSelect={action.action}
                      className={cn("group gap-3", action.group === "Labs" && "lab-cmd-row")}
                    >
                      <span className={action.id === "ask-ai" ? "text-primary" : "text-muted-foreground"}>
                        {action.icon}
                      </span>
                      <span className={action.id === "ask-ai" ? "font-medium" : ""}>{action.label}</span>
                      {/* Côté droit façon Cloudflare : raccourci + flèche visible sur la ligne active */}
                      <span className="ml-auto flex items-center gap-2 pl-2">
                        {action.shortcut && (
                          <span className="flex items-center gap-1">
                            {action.shortcut.split(" ").map((k) => (
                              <kbd key={k} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{k}</kbd>
                            ))}
                          </span>
                        )}
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>

          {/* Pied façon Cloudflare : rappels clavier */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted text-[10px]">↑</kbd>
              <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted text-[10px]">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-[10px]">↵</kbd>
              to select
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-[10px]">esc</kbd>
              to close
            </span>
          </div>
        </>
      )}
    </CommandDialog>
  )
}
