"use client"

import { useState, type ReactNode } from "react"
import { CornerDownLeft, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AssistantQuestion, AssistantToolCall } from "@/lib/api/assistant-service"
import { fillText } from "@/lib/delivery/result-card"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * La question de TaskForce avant un geste (R115, séance n°17) : une question à la fois, ses choix en boutons, le défaut
 * en premier et en évidence, et une réponse tapée toujours possible. Le clic part au serveur, qui reprend le geste sans
 * le modèle ; la suite (une autre question, la carte du geste, ce qu'il a fait) s'affiche ici, par `then`. La question
 * d'une réponse est déjà dans son texte, signée par TaskForce ; celle qui suit une réponse se lit sur la carte.
 */
export function QuestionCard({ slug, call, showText = false, then }: Readonly<{
  slug: string
  call: AssistantToolCall & { question: AssistantQuestion }
  /** Montrer la question sur la carte : celle qui suit une réponse n'a pas de texte au-dessus. */
  showText?: boolean
  /** Ce que la conversation montre de la suite du geste. */
  then: (next: AssistantToolCall) => ReactNode
}>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const answerQuestion = useCortexStore((s) => s.answerQuestion)
  const [typed, setTyped] = useState("")
  const [sending, setSending] = useState(false)
  const [said, setSaid] = useState("")
  const [next, setNext] = useState<AssistantToolCall | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function send(value: string, label: string) {
    if (!value.trim() || sending) return
    setSending(true)
    setProblem(null)
    const result = await answerQuestion(slug, call, value)
    setSending(false)
    if (result) {
      setSaid(label)
      setNext(result)
    } else {
      setProblem(useCortexStore.getState().questionProblem ?? "")
    }
  }

  if (next) {
    return (
      <div className="my-2 flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{fillText(t.questionAnswered, { value: said })}</p>
        {then(next)}
      </div>
    )
  }

  return (
    <div role="group" aria-label={call.question.text} className="my-2 flex flex-col gap-2 border border-border p-2.5 text-xs">
      {showText && <p className="font-medium text-foreground">{call.question.text}</p>}
      {call.question.choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.questionChoices}>
          {call.question.choices.map((choice) => (
            <Button
              key={choice.value}
              size="sm"
              variant={choice.recommended ? "default" : "outline"}
              className="h-7 px-2.5 text-[11px]"
              disabled={sending}
              onClick={() => void send(choice.value, choice.label)}
            >
              {choice.label}
              {choice.recommended && <span className="text-[10px] font-normal opacity-80">· {t.questionDefault}</span>}
            </Button>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void send(typed, typed.trim())
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t.questionFree}
          aria-label={t.questionFree}
          className="h-7 text-xs"
          disabled={sending}
        />
        <Button type="submit" size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-[11px]"
          disabled={sending || !typed.trim()}>
          {sending ? <Loader2 className="size-3 animate-spin" /> : <CornerDownLeft className="size-3" />}
          {sending ? t.questionSending : t.questionSend}
        </Button>
      </form>
      {problem !== null && <p className="whitespace-pre-wrap break-words text-destructive">{fillText(t.questionFailed, { why: problem })}</p>}
    </div>
  )
}
