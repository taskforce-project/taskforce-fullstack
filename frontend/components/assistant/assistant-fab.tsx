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

// ─── Mock adapter (word-by-word streaming) — remplacer par l'API réelle ───────
const SYSTEM_RESPONSES: Record<string, string> = {
  default:
    "Je suis Taskforce AI, votre assistant exécutif. Je peux vous aider à analyser vos projets, rédiger des rapports, prioriser vos tâches ou répondre à toutes vos questions métier.",
}

function createTaskforceAdapter(): ChatModelAdapter {
  return {
    async run({ messages, abortSignal }: ChatModelRunOptions) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")
      const userText =
        lastUser?.content
          ?.filter((c) => c.type === "text")
          .map((c) => ("text" in c ? c.text : ""))
          .join("") ?? ""

      const suffix = userText.length > 60 ? "…" : ""
      const response =
        userText.length > 0
          ? `Compris. Concernant "${userText.slice(0, 60)}${suffix}" — je travaille sur votre demande. Cette fonctionnalité sera connectée à l'API Taskforce prochainement. En attendant, je peux vous aider à structurer votre réflexion ou vous orienter vers la bonne ressource.`
          : SYSTEM_RESPONSES.default

      const words = response.split(" ")

      return {
        stream: new ReadableStream({
          async start(controller) {
            for (const word of words) {
              if (abortSignal.aborted) break
              await new Promise((r) => setTimeout(r, 45))
              controller.enqueue({ type: "text", text: word + " " })
            }
            controller.close()
          },
        }),
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
      <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="size-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Taskforce AI</p>
        <p className="text-xs text-muted-foreground mt-1">
          Votre assistant exécutif. Posez vos questions sur vos projets, équipes ou stratégies.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full mt-2">
        {["Résume mes tâches du jour", "Quels sont mes projets actifs ?", "Aide-moi à rédiger un rapport"].map(
          (suggestion) => (
            <button
              key={suggestion}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 hover:border-foreground/20 transition-colors text-left"
            >
              {suggestion}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

// ─── FAB principal ────────────────────────────────────────────────────────────
export function AssistantFAB() {
  const adapter = useMemo(() => createTaskforceAdapter(), [])
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
            </ThreadPrimitive.Viewport>
            <FABComposer />
          </ThreadPrimitive.Root>
        </AssistantModalPrimitive.Content>
      </AssistantModalPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
