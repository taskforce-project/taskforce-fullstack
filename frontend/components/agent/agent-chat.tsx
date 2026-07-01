"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Send, Sparkles } from "lucide-react"
import {
  Message, Steps, Reasoning, Tool, Sources, ThinkingBar, FeedbackBar, PromptSuggestion,
  type ToolStatus,
} from "@/components/chat"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { sendAgentMessage, type AssistantAnswer } from "@/lib/api/assistant-service"

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

/**
 * Chat agentique : rend la réponse **structurée** de l'agent avec le kit
 * (étapes, raisonnement, appels d'outils, sources Brain OS, réponse markdown).
 * Sans clé LLM, l'agent renvoie quand même les sources réelles (RAG).
 */
export function AgentChat() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, loading])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || loading || !slug) return
    setInput("")
    setTurns((t) => [...t, { id: `u${Date.now()}`, role: "user", text: msg }])
    setLoading(true)
    try {
      const answer = await sendAgentMessage(slug, msg)
      setTurns((t) => [...t, { id: `a${Date.now()}`, role: "assistant", answer }])
    } catch {
      setTurns((t) => [...t, {
        id: `a${Date.now()}`, role: "assistant",
        answer: { answer: "Désolé, je n'ai pas pu répondre. Réessayez.", reasoning: null, mode: "fallback", sources: [], steps: [], toolCalls: [] },
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {turns.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Taskforce AI — agent</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fondé sur le Brain OS de votre workspace. Il cite ses sources.
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
        <p className="mt-1 text-center text-[10px] text-muted-foreground/40">
          Enter pour envoyer · Shift+Enter pour un saut de ligne
        </p>
      </div>
    </div>
  )
}

/** Rend la réponse structurée : étapes → raisonnement → outils → texte → sources → feedback. */
function AgentAnswerView({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="space-y-1">
      {answer.steps.length > 0 && (
        <Steps steps={answer.steps.map((s) => ({ title: s.label, status: s.status }))} />
      )}
      {answer.reasoning && <Reasoning content={answer.reasoning} />}
      {answer.toolCalls.map((tc, i) => (
        <Tool key={i} name={tc.name} status={tc.status as ToolStatus} input={tc.input ?? undefined} output={tc.output ?? undefined} />
      ))}
      <Markdown content={answer.answer} />
      {answer.sources.length > 0 && (
        <Sources items={answer.sources.map((s) => ({ title: s.title, snippet: s.domain, score: s.score ?? undefined }))} />
      )}
      <FeedbackBar className="mt-1" onCopy={() => navigator.clipboard?.writeText(answer.answer)} />
    </div>
  )
}
