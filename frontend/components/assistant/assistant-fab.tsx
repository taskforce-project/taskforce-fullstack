"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import {
  useLocalRuntime,
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  AssistantModalPrimitive,
  useThreadRuntime,
  useThread,
  type ChatModelAdapter,
  type ChatModelRunOptions,
} from "@assistant-ui/react"
import { Bot, X, Send, Sparkles, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Matrix, wave } from "@/components/ui/matrix"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { sendAssistantMessage } from "@/lib/api/assistant-service"

// ─── Adapter réel — appelle l'API assistant du backend (Groq / fallback Java) ───
function createTaskforceAdapter(slug: string): ChatModelAdapter {
  return {
    async run({ messages }: ChatModelRunOptions) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")
      const userText =
        lastUser?.content
          ?.filter((c) => c.type === "text")
          .map((c) => ("text" in c ? c.text : ""))
          .join("") ?? ""

      try {
        const text = slug
          ? await sendAssistantMessage(slug, userText)
          : "Sélectionnez un workspace pour discuter avec l'assistant."
        return { content: [{ type: "text" as const, text }] }
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: "Désolé, je n'ai pas pu répondre pour le moment. Vérifiez votre connexion et réessayez.",
            },
          ],
        }
      }
    },
  }
}

// ─── Composer interne ─────────────────────────────────────────────────────────
function FABComposer() {
  const [text, setText] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const threadRuntime = useThreadRuntime()
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const isRunning = useThread((s) => s.isRunning)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 100)}px`
    }
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isRunning) return
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    threadRuntime.append(trimmed)
    setText("")
    const el = textareaRef.current
    if (el) el.style.height = "40px"
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
    <div className="shrink-0 border-t border-border px-3 py-2">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/40 focus-within:border-foreground/20 transition-colors px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Posez votre question…"
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none resize-none min-h-10 max-h-24 overflow-y-auto block leading-5"
          style={{ height: "40px" }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isRunning}
          className="shrink-0 size-7 rounded-lg flex items-center justify-center bg-foreground text-background hover:opacity-75 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer mb-0.5"
        >
          <Send className="size-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/35 mt-1.5 text-center select-none">
        Enter pour envoyer · Shift+Enter pour saut de ligne
      </p>
    </div>
  )
}

// ─── Messages ─────────────────────────────────────────────────────────────────
function FABUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-3">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-foreground text-background px-3.5 py-2.5 text-sm leading-relaxed">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function FABAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-2 mb-3">
      <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="size-3 text-primary" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-card border border-border px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function FABEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
      {/* Animation dot-matrix ElevenLabs UI (QA3-10) */}
      <div className="flex items-center justify-center text-primary">
        <Matrix rows={7} cols={7} frames={wave} fps={10} size={6} gap={2} ariaLabel="Taskforce AI" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Taskforce AI</p>
        <p className="text-xs text-muted-foreground mt-1">
          Votre assistant exécutif. Posez vos questions sur vos projets, équipes ou stratégies.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full mt-2">
        {["Combien d'issues ouvertes en ce moment ?", "Quelle est notre vélocité cette semaine ?", "Qui est le plus chargé dans l'équipe ?"].map(
          (suggestion) => (
            <ThreadPrimitive.Suggestion key={suggestion} prompt={suggestion} method="replace" autoSend asChild>
              <button
                className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 hover:border-foreground/20 transition-colors text-left cursor-pointer"
              >
                {suggestion}
              </button>
            </ThreadPrimitive.Suggestion>
          ),
        )}
      </div>
    </div>
  )
}

// ─── Indicateur « réfléchit… » (shimmer ElevenLabs UI) ─────────────────────────
function FABThinking() {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const isRunning = useThread((s) => s.isRunning)
  if (!isRunning) return null
  return (
    <div className="flex gap-2 mb-3">
      <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="size-3 text-primary" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-3.5 py-2.5 text-sm">
        <ShimmeringText>Taskforce AI réfléchit…</ShimmeringText>
      </div>
    </div>
  )
}

// ─── Conversation réutilisable (embarquable dans un panneau, PROD-8.9) ─────────
/**
 * Thread + composer de l'assistant, sans header ni modal — destiné à être monté
 * dans un panneau latéral (PanelDock) ou tout autre conteneur flex.
 */
export function AssistantConversation() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const adapter = useMemo(() => createTaskforceAdapter(slug), [slug])
  const runtime = useLocalRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex flex-1 min-h-0 flex-col">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
          <ThreadPrimitive.Empty>
            <FABEmptyState />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage: FABUserMessage,
              AssistantMessage: FABAssistantMessage,
            }}
          />
          <FABThinking />
        </ThreadPrimitive.Viewport>
        <FABComposer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

// ─── FAB principal ────────────────────────────────────────────────────────────
export function AssistantFAB() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const adapter = useMemo(() => createTaskforceAdapter(slug), [slug])
  const runtime = useLocalRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantModalPrimitive.Root unstable_openOnRunStart={false}>
        {/* Anchor fixe en bas à droite */}
        <AssistantModalPrimitive.Anchor className="fixed bottom-5 right-5 z-50">
          <AssistantModalPrimitive.Trigger asChild>
            <button className="group size-12 rounded-2xl bg-foreground text-background shadow-lg hover:scale-105 active:scale-95 transition-all duration-150 flex items-center justify-center cursor-pointer">
              {/* Bot icon quand fermé, X quand ouvert — géré par data-state */}
              <Bot className="size-5 group-data-[state=open]:hidden" />
              <X className="size-5 hidden group-data-[state=open]:block" />
            </button>
          </AssistantModalPrimitive.Trigger>
        </AssistantModalPrimitive.Anchor>

        <AssistantModalPrimitive.Content
          side="top"
          align="end"
          sideOffset={12}
          dissmissOnInteractOutside={false}
          className={cn(
            "z-50 w-90 h-125 rounded-2xl border border-border bg-background shadow-2xl",
            "flex flex-col overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "data-[side=top]:slide-in-from-bottom-2",
          )}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-border bg-card/60">
            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-none">Taskforce AI</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Assistant exécutif</p>
            </div>
            <AssistantModalPrimitive.Trigger asChild>
              <button className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                <Minimize2 className="size-3.5" />
              </button>
            </AssistantModalPrimitive.Trigger>
          </div>

          {/* Thread */}
          <ThreadPrimitive.Root className="flex flex-col flex-1 min-h-0">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
              <ThreadPrimitive.Empty>
                <FABEmptyState />
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{
                  UserMessage: FABUserMessage,
                  AssistantMessage: FABAssistantMessage,
                }}
              />
              <FABThinking />
            </ThreadPrimitive.Viewport>
            <FABComposer />
          </ThreadPrimitive.Root>
        </AssistantModalPrimitive.Content>
      </AssistantModalPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
