"use client"

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react"
import { useRouter, useParams } from "next/navigation"
import { Command } from "cmdk"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  LayoutDashboard,
  Bot,
  Inbox,
  CheckSquare,
  Settings,
  Sparkles,
  ArrowRight,
  Loader2,
  CornerDownLeft,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface NavCommand {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  href: string
}

// ─── Commandes de navigation ──────────────────────────────────────────────────
function useNavCommands(): NavCommand[] {
  const params = useParams()
  const ws = params?.workspace as string | undefined
  const base = ws ? `/${ws}` : ""

  return useMemo(
    () => [
      {
        id: "dashboard",
        label: "Dashboard",
        description: "Vue d'ensemble",
        icon: <LayoutDashboard className="size-4" />,
        href: `${base}/dashboard`,
      },
      {
        id: "agents",
        label: "Agents IA",
        description: "Suite exécutive IA",
        icon: <Bot className="size-4" />,
        href: `${base}/agents`,
      },
      {
        id: "inbox",
        label: "Inbox",
        description: "Notifications & mises à jour",
        icon: <Inbox className="size-4" />,
        href: `${base}/inbox`,
      },
      {
        id: "my-work",
        label: "My Work",
        description: "Mes tâches et projets",
        icon: <CheckSquare className="size-4" />,
        href: `${base}/my-work`,
      },
      {
        id: "settings",
        label: "Paramètres",
        description: "Workspace & compte",
        icon: <Settings className="size-4" />,
        href: `${base}/settings`,
      },
    ],
    [base],
  )
}

// ─── Hook streaming IA (mock) — brancher sur fetch réel ──────────────────────
function useAIStream(query: string | null) {
  const [text, setText] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!query) {
      setText("")
      setIsRunning(false)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const reply = [
      `Je traite votre demande : « ${query.slice(0, 80)} ».`,
      "Cette réponse sera bientôt connectée à l'API Taskforce.",
      "Je peux également vous rediriger vers la section pertinente ou vous aider à préciser votre question.",
    ].join(" ")

    const words = reply.split(" ")
    let i = 0
    setText("")
    setIsRunning(true)

    const tick = setInterval(() => {
      if (ac.signal.aborted || i >= words.length) {
        clearInterval(tick)
        if (!ac.signal.aborted) setIsRunning(false)
        return
      }
      setText((prev) => (prev ? `${prev} ${words[i]}` : words[i]))
      i++
    }, 40)

    return () => {
      ac.abort()
      clearInterval(tick)
    }
  }, [query])

  return { text, isRunning }
}

// ─── Command Palette ──────────────────────────────────────────────────────────
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [aiQuery, setAiQuery] = useState<string | null>(null)
  const router = useRouter()
  const navCommands = useNavCommands()
  const { text: aiText, isRunning } = useAIStream(aiQuery)

  // Cmd+K / Ctrl+K global
  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Reset à chaque ouverture
  useEffect(() => {
    if (open) {
      setInputValue("")
      setAiQuery(null)
    }
  }, [open])

  const handleClose = useCallback(() => setOpen(false), [])

  const filteredCommands = useMemo(() => {
    if (!inputValue.trim()) return navCommands
    const lower = inputValue.toLowerCase()
    return navCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        (c.description?.toLowerCase().includes(lower) ?? false),
    )
  }, [navCommands, inputValue])

  // Mode IA : aucune commande ne match ET input assez longue
  const isAiMode = inputValue.trim().length > 2 && filteredCommands.length === 0

  const handleNavigate = useCallback(
    (href: string) => {
      router.push(href)
      handleClose()
    },
    [router, handleClose],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && isAiMode && !aiQuery) {
        e.preventDefault()
        setAiQuery(inputValue.trim())
      }
      if (e.key === "Escape") {
        if (aiQuery) {
          setAiQuery(null)
          setInputValue("")
        } else {
          handleClose()
        }
      }
    },
    [isAiMode, aiQuery, inputValue, handleClose],
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogHeader className="sr-only">
        <DialogTitle>Palette de commandes</DialogTitle>
        <DialogDescription>Naviguez ou posez une question à l'IA</DialogDescription>
      </DialogHeader>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 gap-0 max-w-140 top-[30%] translate-y-0 shadow-2xl"
      >
        <Command shouldFilter={false}>
          {/* Input */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
            <Sparkles className="size-4 text-muted-foreground/60 shrink-0" />
            <Command.Input
              value={inputValue}
              onValueChange={setInputValue}
              onKeyDown={handleKeyDown}
              placeholder="Naviguer ou demander à l'IA…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-none"
            />
            {isAiMode && !aiQuery && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 shrink-0">
                <CornerDownLeft className="size-3" />
                <span>pour demander</span>
              </div>
            )}
            <kbd className="text-[10px] text-muted-foreground/40 border border-border rounded px-1.5 py-0.5 font-mono shrink-0 bg-muted/40">
              ESC
            </kbd>
          </div>

          {/* Réponse IA streamée */}
          {aiQuery && (
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-start gap-2.5">
                <div className="size-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  {isRunning ? (
                    <Loader2 className="size-3 text-primary animate-spin" />
                  ) : (
                    <Sparkles className="size-3 text-primary" />
                  )}
                </div>
                <p className="text-sm text-foreground leading-relaxed flex-1 min-h-5">
                  {aiText}
                  {isRunning && (
                    <span className="inline-block w-1 h-3.5 bg-primary/70 rounded-sm ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </div>
              {!isRunning && (
                <button
                  onClick={() => {
                    setAiQuery(null)
                    setInputValue("")
                  }}
                  className="mt-2 ml-7 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                >
                  ← Nouvelle question
                </button>
              )}
            </div>
          )}

          {/* Liste de commandes */}
          {!aiQuery && (
            <Command.List className="max-h-72 overflow-y-auto py-2">
              {filteredCommands.length === 0 && !isAiMode && (
                <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Aucune commande trouvée
                </Command.Empty>
              )}

              {filteredCommands.length > 0 && (
                <Command.Group
                  heading="Navigation"
                  className="**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-muted-foreground/50"
                >
                  {filteredCommands.map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.label}
                      onSelect={() => handleNavigate(cmd.href)}
                      className="flex items-center gap-3 px-4 py-2.5 mx-1 rounded-lg cursor-pointer text-sm text-foreground hover:bg-muted data-[selected=true]:bg-muted transition-colors"
                    >
                      <span className="text-muted-foreground">{cmd.icon}</span>
                      <span className="flex-1 font-medium">{cmd.label}</span>
                      {cmd.description && (
                        <span className="text-xs text-muted-foreground/60">{cmd.description}</span>
                      )}
                      <ArrowRight className="size-3 text-muted-foreground/30 shrink-0" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {isAiMode && (
                <Command.Group
                  heading="IA"
                  className="**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-muted-foreground/50"
                >
                  <Command.Item
                    value={`__ai__${inputValue}`}
                    onSelect={() => setAiQuery(inputValue.trim())}
                    className="flex items-center gap-3 px-4 py-2.5 mx-1 rounded-lg cursor-pointer text-sm text-foreground hover:bg-muted data-[selected=true]:bg-muted transition-colors"
                  >
                    <Sparkles className="size-4 text-primary shrink-0" />
                    <span className="flex-1">
                      Demander : <span className="text-muted-foreground/70">"{inputValue}"</span>
                    </span>
                    <CornerDownLeft className="size-3 text-muted-foreground/40 shrink-0" />
                  </Command.Item>
                </Command.Group>
              )}
            </Command.List>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border bg-muted/20">
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
              <kbd className="font-mono border border-border rounded px-1 py-0.5 bg-background">↑↓</kbd>
              naviguer
            </span>
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
              <kbd className="font-mono border border-border rounded px-1 py-0.5 bg-background">↵</kbd>
              sélectionner
            </span>
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5 ml-auto">
              <kbd className="font-mono border border-border rounded px-1 py-0.5 bg-background">⌘K</kbd>
              ouvrir / fermer
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
