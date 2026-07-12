"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Send, Sparkles, MessageSquare, ChevronDown, Plus, Trash2 } from "lucide-react"
import {
  Message, Steps, Reasoning, Tool, Sources, ThinkingBar, FeedbackBar, PromptSuggestion, TokenMeter,
  type ToolStatus,
} from "@/components/chat"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { cn } from "@/lib/utils"
import { sendAgentMessage, type AssistantAnswer } from "@/lib/api/assistant-service"
import {
  listConversations, getConversation, deleteConversation,
  type ConversationSummary, type ConversationMessage,
} from "@/lib/api/ai-conversation-service"
import { CortexUsage } from "./cortex-usage"

interface Turn {
  id: string
  role: "user" | "assistant"
  text?: string
  answer?: AssistantAnswer
}

const SUGGESTIONS = [
  "Analyse nos décisions sur les embeddings",
  "Quels problèmes avons-nous rencontrés ?",
  "Résume l'architecture de TaskForce",
]

/** Reconstruit des tours à partir des messages persistés (rendu de l'historique). */
function messagesToTurns(messages: ConversationMessage[]): Turn[] {
  return messages.map((m) =>
    m.role === "user"
      ? { id: `m${m.id}`, role: "user", text: m.content }
      : {
          id: `m${m.id}`, role: "assistant",
          answer: {
            answer: m.content, reasoning: null,
            mode: (m.mode as AssistantAnswer["mode"]) ?? "fast",
            sources: [], steps: [], toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: m.totalTokens },
          },
        },
  )
}

/**
 * Chat agentique multi-conversation : liste/historique/nouvelle/suppression, rendu structuré de la
 * réponse (étapes, outils, sources Brain OS), jauge de contexte = empreinte tokens de la conversation.
 */
export function AgentChat() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  // Multi-conversation
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [convTokens, setConvTokens] = useState(0) // empreinte de la conversation (jauge de contexte)
  const [showList, setShowList] = useState(false)

  const [elapsed, setElapsed] = useState(0)
  const [lastMs, setLastMs] = useState<number | null>(null)
  const startRef = useRef<number>(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    if (!slug) return
    try { setConversations(await listConversations(slug)) } catch { /* non bloquant */ }
  }, [slug])

  useEffect(() => { void loadConversations() }, [loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, loading])

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 100)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!showList) return
    const onDown = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) setShowList(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [showList])

  const openConversation = async (id: number) => {
    setShowList(false)
    try {
      const detail = await getConversation(slug, id)
      setTurns(messagesToTurns(detail.messages))
      setCurrentId(detail.id)
      setConvTokens(detail.totalTokens)
    } catch { /* non bloquant */ }
  }

  const newConversation = () => {
    setShowList(false)
    setTurns([])
    setCurrentId(null)
    setConvTokens(0)
  }

  const removeConversation = async (id: number) => {
    try {
      await deleteConversation(slug, id)
      if (id === currentId) newConversation()
      await loadConversations()
    } catch { /* non bloquant */ }
  }

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || loading || !slug) return
    setInput("")
    setTurns((t) => [...t, { id: `u${Date.now()}`, role: "user", text: msg }])
    setLoading(true)
    startRef.current = Date.now()
    setElapsed(0)
    try {
      const res = await sendAgentMessage(slug, msg, currentId)
      setCurrentId(res.conversationId)
      setConvTokens((n) => n + (res.answer.usage?.totalTokens ?? 0))
      setTurns((t) => [...t, { id: `a${Date.now()}`, role: "assistant", answer: res.answer }])
      void loadConversations()
    } catch {
      setTurns((t) => [...t, {
        id: `a${Date.now()}`, role: "assistant",
        answer: { answer: "Désolé, je n'ai pas pu répondre. Réessayez.", reasoning: null, mode: "fallback", sources: [], steps: [], toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      }])
    } finally {
      setLastMs(Date.now() - startRef.current)
      setLoading(false)
    }
  }

  const currentTitle = currentId
    ? (conversations.find((c) => c.id === currentId)?.title ?? "Conversation")
    : "Nouvelle conversation"

  return (
    <div className="flex h-full flex-col">
      {/* En-tête multi-conversation : switcher + nouvelle */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <div ref={listRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => { setShowList((v) => !v); if (!showList) void loadConversations() }}
            className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted"
          >
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{currentTitle}</span>
            <ChevronDown className={cn("size-3 shrink-0 transition-transform", showList && "rotate-180")} />
          </button>

          {showList && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onClick={newConversation}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted"
              >
                <Plus className="size-3.5" /> Nouvelle conversation
              </button>
              <div className="my-1 h-px bg-border" />
              <div className="max-h-64 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">Aucune conversation.</p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-muted",
                        c.id === currentId && "bg-muted",
                      )}
                    >
                      <button type="button" onClick={() => openConversation(c.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs">{c.title}</span>
                        <span className="text-[10px] text-muted-foreground">{c.messageCount} message{c.messageCount > 1 ? "s" : ""}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeConversation(c.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        title="Supprimer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={newConversation}
          title="Nouvelle conversation"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {turns.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Cortex</p>
              <p className="mt-1 text-xs text-muted-foreground">
                L&apos;agent IA de Taskforce, fondé sur le Brain OS de votre workspace. Il cite ses sources.
              </p>
            </div>
            <div className="mt-2 flex w-full flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <PromptSuggestion key={s} onClick={() => send(s)}>{s}</PromptSuggestion>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) =>
            t.role === "user" ? (
              <Message key={t.id} role="user" content={t.text} />
            ) : (
              <Message key={t.id} role="assistant">
                {t.answer && <AgentAnswerView answer={t.answer} />}
              </Message>
            ),
          )
        )}
        {loading && (
          <Message role="assistant">
            <ThinkingBar />
          </Message>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex items-end gap-2 rounded-xl border bg-muted/40 px-3 py-2 focus-within:border-foreground/20">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
            placeholder="Posez votre question…"
            rows={1}
            className="max-h-24 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-75 disabled:opacity-30"
          >
            <Send className="size-3.5" />
          </button>
        </div>
        {/* Footer façon Claude : chrono/conso en direct (gauche) + modal contexte/consommation (droite) */}
        <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground/50">
          <span className="flex min-w-0 items-center gap-1.5">
            {loading ? (
              <span className="tabular-nums text-primary/70">Cortex réfléchit · {elapsed.toFixed(1)} s</span>
            ) : convTokens > 0 ? (
              <>
                <TokenMeter value={convTokens} className="text-muted-foreground/60" />
                {lastMs != null && <span className="tabular-nums">· {(lastMs / 1000).toFixed(1)} s</span>}
              </>
            ) : (
              <span>Entrée ↵ · Maj+Entrée</span>
            )}
          </span>
          <CortexUsage sessionTokens={convTokens} />
        </div>
      </div>
    </div>
  )
}

/** Rend la réponse structurée : étapes → raisonnement → outils → texte → sources → feedback. */
function AgentAnswerView({ answer }: { answer: AssistantAnswer }) {
  const hasBreakdown = answer.usage && (answer.usage.promptTokens > 0 || answer.usage.completionTokens > 0)
  return (
    <div className="space-y-1">
      {answer.steps.length > 0 && (
        <Steps steps={answer.steps.map((s) => ({ title: s.label, status: s.status, description: s.description ?? undefined }))} />
      )}
      {answer.reasoning && <Reasoning content={answer.reasoning} />}
      {answer.toolCalls.map((tc, i) => (
        <Tool key={i} name={tc.name} status={tc.status as ToolStatus} input={tc.input ?? undefined} output={tc.output ?? undefined} />
      ))}
      <Markdown content={answer.answer} />
      {answer.sources.length > 0 && (
        <Sources items={answer.sources.map((s) => ({ title: s.title, snippet: s.domain, score: s.score ?? undefined }))} />
      )}
      <div className="mt-1 flex items-center justify-between gap-2">
        <FeedbackBar onCopy={() => navigator.clipboard?.writeText(answer.answer)} />
        {answer.usage && answer.usage.totalTokens > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground/60">
            <span className="rounded bg-muted px-1 py-px font-medium uppercase tracking-wide">{answer.mode}</span>
            {answer.usage.totalTokens.toLocaleString("fr-FR")} tokens
            {hasBreakdown && <span className="opacity-70">({answer.usage.promptTokens}↑ {answer.usage.completionTokens}↓)</span>}
          </span>
        )}
      </div>
    </div>
  )
}
